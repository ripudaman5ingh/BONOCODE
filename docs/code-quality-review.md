# Code quality review: whole codebase

**Date:** 2026-10-30
**Branch:** `m1/git-text` (`8e1cf47`)
**Scope:** `src/` (about 138k lines of non-test TS/TSX/CSS) and `src-tauri/src/` (about 32k lines of Rust). Tests were read only to find duplicated helpers.
**Lens:** structure, abstraction, duplication and boundaries. This review does not hunt for correctness bugs.

---

## Verdict

**Not at the approval bar.** The code is well tested (about 70k test lines) and well typed: there is effectively no `any` and no `@ts-ignore`. The problem is that complexity keeps growing sideways. The same runtime is copied into every provider adapter. Domain logic piles into a few huge files. A refactor that was meant to delete complexity (the App.tsx split) mostly moved it into hook argument lists.

The repeated pattern is: **the right abstraction already exists somewhere in the repo, and the code around it doesn't use it.**
- `liveSessions.ts` is a clean external store, but tab, project and terminal state still use `useState` with ref mirrors.
- `HarnessAdapter` is a capability registry, but UI code still branches on `harness === "codex"`.
- `shared/lib/jsonText.ts` has `stringField`, but 15 files define their own version.
- `fs.rs` has a careful git runner, but `worktrees.rs` writes its own.

The biggest wins are "code judo" moves that **delete** code by routing it through what already exists:

| # | Move | Rough lines deleted | Risk |
|---|---|---|---|
| 1 | Move workspace state into external stores, like `liveSessions` | most of the 330+ hook arguments and 14 ref mirrors | medium |
| 2 | Extract the shared adapter runtime (thread registry, turn latch, interaction queue) | 600–1,000 | medium |
| 3 | Make the harness binary spec data-driven in Rust | 400–600 | low |
| 4 | `defineSetting()` factory | 800+ | low |
| 5 | One `record.ts` for untyped JSON | about 300, plus a semantic trap | low |
| 6 | Capability fields on `HarnessAdapter` instead of `harness === "x"` | scattered branches in 11 files | low |
| 7 | Split `fs.rs` into `git/`, `github/`, `transcripts`, `fs` | 0 (pure move) | low |
| 8 | Table-driven, transactional SQLite migrations | about 250 | low |

---

## 1. Structural regressions and missed code-judo moves

### 1.1 The App.tsx split moved complexity instead of deleting it

`src/app/App.tsx` went from 8,923 to 1,581 lines, which is real progress. But `Workspace` is now a manual dependency-injection container. It calls 22 custom hooks, and they take **more than 330 named arguments** between them:

| Hook | Args | Hook | Args |
|---|---|---|---|
| `useSessionLifecycle` (App.tsx:857) | **53** | `useWorktreeActions` (810) | 27 |
| `useProjectActions` (549) | 37 | `useTerminalTabActions` (766) | 23 |
| `useWorkspaceTabActions` (498) | 36 | `useWorkspaceView` (722) | 19 |
| `useAppCommands` (1142) | 32 | `useTurnController`, `useSessionListActions`, `useSessionHistory` | 13–14 each |

Two symptoms show that the hooks were cut along line ranges, not along ownership boundaries:

- **State plus ref mirror pairs.** 14 pieces of state are passed as both the value and a `*Ref` copy: `sessions`/`sessionsRef`, `tabs`/`tabsRef`, `activeTabId`/`activeTabIdRef`, `projectCwd`/`projectCwdRef`, `sidebarCwd`, `gitCwd`, `projectTerminals`, `projectTerminalFocused`, `dirtyFiles`, `lastDockSide`, `searchViewOpen`, `settingsOpen`, `filePickerOpen`, `whatsNewVersion`. Each pair is two names for one concept, and every hook has to know which one to read in which context.
- **Forward refs assigned during render** to break cycles between hooks: `setSidebarTabRef.current = …` (App.tsx:609), `onPinFileRef` (611), `onOpenTerminalRef` (792), `onVisitBackRef`/`onVisitForwardRef` (794–795), `onSelectHistorySessionRef` (912), `linkedSessionUpdatesRef` (1055). There are another 57 `xRef.current = x;` assignments under `features/*/hooks`. Each one is an undeclared dependency edge.

**The code-judo move:** `features/sessions/model/liveSessions.ts` already solves this for sessions. It holds a module-level snapshot with `get`/`set`/`subscribe` and a `ref` getter whose reads are always fresh. Do the same for the rest of the workspace: create a `workspaceStore` for tabs, active tab, project cwd, recents, terminals and dirty files, and a small `uiStore` for the open/closed surfaces. Then:
- a hook that needs a fresh read calls `workspace.get()`, so the `*Ref` mirrors disappear;
- a hook that needs to re-render calls `useWorkspace(selector)`, so the value arguments disappear;
- callbacks stop being threaded between hooks because each hook imports the store, so the forward refs disappear.

`useSessionLifecycle` should drop from 53 arguments to fewer than 10. This is the plan `docs/app-split-map.md` was already heading toward. Finish it instead of adding more hooks.

### 1.2 Every provider adapter re-implements the same live-session runtime

`src/integrations/harness/providers/*` has ten adapters. Their protocols really are different. **Their lifecycle bookkeeping is not**, yet it is copied by hand:

| Pattern | Copied in |
|---|---|
| `const liveByThread = new Map`, `resumeByThread = new Map` | antigravity, claude, codex, cursor, fx, grok, hermes, opencode (8) |
| `const cancelledThreads = new Set` | claude, codex, cursor, fx, grok, hermes, opencode (7) |
| `finishActiveTurn` + `settlePendingTurn` (a `turnDone`/`turnFailed`/`turnEndPending` latch) | claude, codex (codex.ts:1091), opencode (opencode.ts:1198), pi (piFamily.ts:1274) |
| `waitApproval` / `waitQuestion` / `showNextQuestion` (`visibleQuestionId` queue) | claude (claude.ts:1148–1186), codex, opencode (opencode.ts:1140–1196) |
| `send/compact/steer/cancel/stop/forget/bind` exports | every adapter, renamed per provider (`sendClaudeTurn`, `sendCodexTurn`, …) |

The `finishActiveTurn` bodies in opencode, codex and pi are line-for-line the same latch. The only differences are a guard in pi and some extra per-turn `clear()` calls in codex. `showNextQuestion` is identical in claude and opencode except for how the event is built.

**The code-judo move:** add three small primitives under `core/` and make each adapter only a protocol translator:

```ts
// core/threads.ts
createThreadRegistry<Live, Resume>()   // live/resume/cancelled maps plus stop/forget/bind

// core/turnLatch.ts
const turn = createTurnLatch();        // begin(): Promise<void>; finish(events?); settle(); fail(err)
                                       // with an onFinish hook for codex's per-turn clears

// core/interactions.ts
const asks = createInteractionQueue(onEvent);
await asks.approval(uiId, payload);    // resolves with ApprovalDecision, emits approval.resolved
await asks.question(uiId, event);      // owns visibleQuestionId and showNextQuestion
```

Then `claude.ts` (1,821 lines), `cursor.ts` (1,642), `opencode.ts` (1,375), `codex.ts` (1,360) and `piFamily.ts` (1,293) each lose a few hundred lines. They also stop being able to drift apart on edge cases like "should cancel clear the visible question?". Today each adapter answers that question separately.

### 1.3 Rust harness binary resolution is the same code repeated per provider

`src-tauri/src/harness.rs` (3,943 lines) has **11 `harness_resolve_*` Tauri commands**. Each one follows the same shape: resolve → map to a struct → `ok_or_else(install hint)`. Behind them sit `resolve_pi`, `resolve_omp`, `resolve_opencode`, `resolve_grok` and others, and each builds the same candidate list (`~/.local/bin`, `~/.npm-global/bin`, `~/.cargo/bin`, `~/n/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/snap/bin`, then the login-shell `which`). `file_mentions_fx_agent` (harness.rs:2436) and `file_mentions_grok_agent` (harness.rs:2499) are the same chunked marker scanner with different `MARKERS` constants. All of these commands return `CursorBinary` (harness.rs:73), so a Cursor-specific name has leaked into every provider.

**The code-judo move:** describe the providers as data and keep one code path:

```rust
struct HarnessSpec {
    id: &'static str,
    names: &'static [&'static str],
    extra_dirs: &'static [&'static str],   // e.g. ".bun/bin" for omp
    identify: Identify,                    // Markers(&[..]) | HelpProbe(..) | Either
    install_hint: &'static str,
}
const HARNESSES: &[HarnessSpec] = &[ … ];

#[tauri::command(async)]
fn harness_resolve(provider: String) -> Result<HarnessBinary, String>
```

The frontend's per-provider `setXBinaryResolver` calls then become a single call that takes a provider id.

### 1.4 Provider knowledge leaks into shared code even though the registry exists

`core/registry.ts` says: *"App.tsx dispatches through the registry instead of harness-specific branches."* That is not true outside App.tsx:

- **Two sources of truth.** `features/sessions/model/editLastTurn.ts:10` `harnessSupportsEditLastTurn` hard-codes `pi | omp | codex | opencode`. That is exactly the set of adapters that implement `rewindLastTurn`. Replace it with `Boolean(getAdapter(h)?.rewindLastTurn)`.
- **Persistence layer.** `features/sessions/data/sessionStore.ts:447–485`: `getSession` runs provider-specific transcript repair for claude (shell commands), codex (relabel), omp (interjections) and cursor (subagents). A storage module should not know about four harnesses. Add `repairLoadedSession?(session): Promise<Session>` to `HarnessAdapter` and call it from one place.
- **UI.** `useProviderControls.ts:180` (which harnesses report usage), `UsageFooter.tsx:94–315`, `useTurnController.ts:1524`, `Composer.tsx:750, 2366`, `ModelPicker.tsx:132, 189`, and `ModelSettings.tsx:39`. ModelPicker and ModelSettings carry the **same** `opencode && setting.id === "agent"` filter.

**Remedy:** add declared capabilities to `HarnessAdapter`, for example `usage?: "claude" | "codex" | …`, `hiddenSettings?: string[]`, `repairLoadedSession?` and `supportsAttachments?`. The UI then reads capabilities instead of provider ids. Adding the next harness then means one new folder and no edits scattered through shared code.

### 1.5 `fs.rs` is a 5,700-line module covering five domains

`src-tauri/src/fs.rs` is 8,514 lines: 5,707 of production code plus tests. It exposes **63 Tauri commands**, and `lib.rs` registers 167 in total. Most of it is not filesystem code:

| Region | Domain |
|---|---|
| 140–530 | OMP and Claude **transcript parsing** (`omp_session_interjections`, `claude_shell_commands`) |
| 530–830, 4587–4980, 5003–5700 | the actual filesystem: listing, walking, ignore rules, read/write/rename/copy/move |
| 832–1130, 1644–2600, 3661–3725, 4036–4580 | **git porcelain**: diff index, history, staging, commit, push/pull/sync, branches, stash |
| 1150–1640, 2594–3990 | **GitHub**: the `gh` CLI, about 15 GraphQL envelope structs, work items, review threads, PR checks, check details |
| 4940–5000 | clone |

**Remedy:** a pure move that changes no behavior. Split it into `git/{mod.rs (runner), diff.rs, history.rs, branches.rs, sync.rs}`, `github/{mod.rs, graphql.rs, work_items.rs, pr.rs, checks.rs}`, `transcripts.rs` and `fs.rs`. Each piece's tests move with it. This also gives finding 2.1 an obvious home.

---

## 2. Duplicated canonical helpers

### 2.1 There is no single git runner in Rust

`fs.rs:4053–4245` has a careful runner: `git_cmd` → `git_cmd_for_args` (it injects the login-shell `PATH` for `commit/push/pull/fetch/clone` so that signers, hooks and LFS work), `git_checked`, `git_output` and `git_output_capped`. Other modules bypass it:

- `worktrees.rs:32` defines its own `fn git(root, args)`. It drops `--no-pager` and never injects the GUI `PATH`. `git worktree add` runs hooks (`post-checkout`), so this is a real divergence, not only a style difference.
- `checkpoint.rs:875` and `:1070` call `Command::new("git")` directly.
- Test modules define their own `fn git(dir, args)` three times (`fs.rs:6450`, `search.rs:473`, `checkpoint.rs:1429`).

**Remedy:** `git/mod.rs` becomes the only place that builds a git `Command`. Add a `#[cfg(test)] mod test_support` for the repo fixture.

### 2.2 Untyped-JSON helpers are copied about 15 times with conflicting contracts

`asRecord` / `stringField` / `numberField` are defined separately in `claudeProtocol.ts:78`, `codexProtocol.ts:188`, `opencodeProtocol.ts:46`, `piProtocol.ts:76`, `grokProtocol.ts:908`, `antigravityProtocol.ts:544`, `hermesProtocol.ts:204`, `fxProtocol.ts:680`, `fxTool.ts:259`, `cursor.ts:1325/1585`, `cursorText.ts:417`, `cursorCatalog.ts:419`, `core/preview.ts:1011`, `sessions/model/taskList.ts:103`, `sessions/model/userQuestion.ts:233`, and `providers/model/rateLimits.ts:502`.

There is also a trap. The canonical `shared/lib/jsonText.ts:65` `stringField` returns `""` for a non-string. The provider copies return `undefined` **and reject blank strings**. Two functions share a name but have opposite contracts, and which one you get depends on the import path.

**Remedy:** create one `shared/lib/record.ts` with explicitly named variants, for example `asRecord`, `stringField` (returns `string | undefined`), `nonBlankString` and `numberField`. Delete all the copies, and rename or remove the `jsonText` version. With 342 `Record<string, unknown>` occurrences in non-test code, keep the untyped records inside each `*Protocol.ts` decoder and hand typed frames to the adapters.

### 2.3 Small Rust duplicates

- `validate_id` exists three times with identical bodies: `checkpoint.rs:1382`, `cursor_store.rs:346`, and `session_store.rs:2086` (already `pub(crate)`). Delete the other two.
- The current time in milliseconds exists three times: `pi_usage.rs:96 now_ms -> u64`, `rate_limits.rs:554 now_ms -> i64`, and `session_store.rs now_millis -> i64`.

---

## 3. Boilerplate that should be a factory

### 3.1 Settings persistence

`features/settings/model/settings.ts` (1,220 lines) and `appearance.ts` (867 lines) contain **37 `load*` functions** plus matching `save*` and about 10 `subscribe*` functions. Each one hand-writes the same steps: try/catch around `localStorage`, parse with a fallback, dispatch a `CustomEvent`, and an add/remove listener pair. Example: `ModelControls` at settings.ts:631–671 is 40 lines for one enum. There are 34 distinct `"bonocode:*"` event names. Some settings have a change event but no subscribe helper, so components subscribe inline. For example, `Composer.tsx:829` hand-wires `COMPOSER_RUNNER_CHANGE_EVENT`.

**The code-judo move:**

```ts
export const modelControls = defineSetting({
  key: "bonocode.modelControls",
  default: "menu" as ModelControls,
  parse: oneOf("menu", "beside"),
  migrate: () => legacyFlag(COMPOSER_EFFORT_VISIBLE_KEY) ? "beside" : undefined,
});
// modelControls.load(), .save(v), .subscribe(fn), useSetting(modelControls)
```

That is one line per setting instead of about 25. It also gives every setting a subscription and a React hook for free, so the inline listeners in components go away.

### 3.2 SQLite migrations: repeated code, and not atomic

`session_store.rs:659–984`: `migrate()` is a 325-line function. It has 19 `if current < N { … }` blocks, and each one hand-writes `INSERT INTO schema_migrations (version, applied_at) VALUES (N, ?1)`. None of them runs inside a transaction. A crash between an `ALTER TABLE` and its version insert leaves a schema change with no version row, and the next start fails with "duplicate column". The `ensure_column` helper and the comment at about line 757 show that schema/version drift has already happened (there, from builds that reused version numbers).

**Remedy:**

```rust
const MIGRATIONS: &[(i64, fn(&Transaction) -> rusqlite::Result<()>)] = &[(1, v1), (2, v2), …];
for &(version, apply) in MIGRATIONS.iter().filter(|(v, _)| *v > current) {
    let tx = conn.unchecked_transaction()?;
    apply(&tx)?;
    tx.execute("INSERT INTO schema_migrations …", params![version, now_millis()])?;
    tx.commit()?;
}
```

SQLite DDL is transactional, so this makes each step atomic and deletes the repeated code.

---

## 4. Layering and boundaries

- **Integrations depend on features.** 54 non-test files under `integrations/` import from `features/`. The base contract `integrations/harness/core/types.ts` imports `Attachment`, `ToolPreview`, `TurnMetrics` and others from `features/sessions/model/session`. `core/registry.ts` imports `features/source-control/model/gitText` and `features/sessions/model/models`. As a result, the protocol layer cannot be understood or tested without the sessions feature.
  → Move the shared domain vocabulary (`Session`, `Block`, `HarnessId`, `ToolPreview`, `TaskListItem`, `UserQuestion`, `PrContent`) into a lower layer, such as `src/domain/`, that both sides import.
- **Features depend on `app/`.** 25 feature files import from `app/`. `app/shell/TitleBar` is imported by 8 features, `app/model/appLifecycle` by 6, `app/model/windowTransfer` by 6 and `app/model/releaseNotes` by 5. Either these modules are shared infrastructure (so move them to `shared/` or `platform/`), or the features are reaching up into the shell.
- **Feature folders are mutually dependent.** There are import cycles: `sessions ↔ workspace` (22 / 15 imports), `sessions ↔ projects` (23 / 13), `sessions ↔ source-control` (11 / 19), `sessions ↔ files` (26 / 9) and `github ↔ source-control` (9 / 9). The folders organize files but do not enforce boundaries. Not every cycle needs breaking, but the domain-layer move above removes most of them. A lint rule such as `import/no-cycle` or dependency-cruiser would stop new ones.
- **`shared/` and `platform/` import features:** `shared/hooks/useColorScheme.ts`, `platform/tauri/fs.ts` and `platform/tauri/clipboard.ts`. Those layers should not depend on anything above them.

---

## 5. File size and decomposition

38 non-test source files are over 1,000 lines. The ones that matter most are those where **a single function** is the problem:

| File | Lines | Problem | Split |
|---|---|---|---|
| `features/sessions/ui/Composer.tsx` | 2,594 | `Composer` is one ~1,950-line function (467–2417) with **31 `useState` and 26 `useEffect`**. It owns five independent sub-features. | Extract `useMcpPicker` (6 states: open, connections, status, loading, error, selected), `useSessionFolderPicker` (3), `useSlashMenu` (slash, skillActive, creatingSkill, createBusy, createError), `useMentionMenu` (mention, mentionActive, files, index ref) and `useComposerAttachments` (attachments, paste, drag). Each popup becomes its own component. |
| `app/shell/Sidebar.tsx` | 3,065 | `SidebarComponent` is ~1,630 lines (275–1905). | Split the project section, session list and folder management into components with their own state. |
| `features/settings/ui/SettingsView.tsx` | 3,750 | 28 components in one file, including **generic primitives** (`Group`, `Row`, `Segmented`, `Slider`, `Toggle`, `Select`, `AccentColorPicker` at 3294–3586). | Move the primitives to `shared/ui/settings/`, give each `*Page` its own file under `settings/ui/pages/`, and keep `SettingsView` as the router. |
| `features/sessions/ui/AgentTranscript.tsx` | 3,610 | 31 components plus 23 helpers; `AgentTranscriptComponent` alone is ~760 lines. | Split into `transcript/{TurnRow, UserMessage, ActivityRows, ToolCall, Subagents}.tsx`. |
| `src-tauri/src/harness.rs` | 3,943 | Binary resolution, MCP commands, account dirs, SSE, exec allow-list and the process reaper in one module. | Split into `harness/{resolve.rs (with §1.3), process.rs, mcp.rs, sse.rs, accounts.rs}`. |
| `src-tauri/src/session_store.rs` | 3,857 | Migrations, upsert, block storage and full-text search in one file. | Split into `migrations.rs` (with §3.2), `blocks.rs` and `search.rs`. |
| `features/sessions/hooks/useTurnController.ts` | 1,779 | Becomes much smaller once the store change (§1.1) removes the dependency plumbing. | Revisit after §1.1. |

Rule for new work: **no PR should push a file past 1,000 lines.** These files are already past it. Changes to them should shrink them, not grow them.

---

## 6. What is good, and worth keeping

- **Type hygiene is excellent.** In non-test code there is 1 `as unknown as`, 1 `any`, 4 `eslint-disable` and 0 `@ts-ignore`.
- **Test investment is serious.** About 70k test lines, including live protocol tests per provider.
- **`liveSessions.ts`** is a clean, side-effect-free store whose methods are plain closures. It is the model for §1.1.
- **`HarnessAdapter` and the registry** is the right seam. It only needs capabilities (§1.4) and shared runtime pieces (§1.2).
- **`docs/app-split-map.md`** shows the right discipline: measure, then cut. Apply the same treatment to `fs.rs`, `harness.rs` and `Composer.tsx`.
- **Rust git output capping** (`git_output_capped`, with the bounded queue documented at `fs.rs:4126`) is careful, well-commented engineering. It is the reason to make it the only git runner (§2.1).

---

## Suggested order

Cheap, mechanical, low-risk first. Then the moves that need care.

1. **§2.2 `record.ts`**, **§2.3 Rust duplicates** and **§1.4 `harnessSupportsEditLastTurn`**: a half-day of deletions.
2. **§1.5 split `fs.rs`** and **§2.1 single git runner**: pure moves, and the existing tests cover them.
3. **§3.2 migrations** and **§3.1 `defineSetting`**: mechanical, high deletion ratio.
4. **§1.3 data-driven harness specs** in Rust.
5. **§1.2 adapter runtime primitives**: start with `createTurnLatch`, since 4 adapters share an identical latch, then the interaction queue.
6. **§1.1 workspace store**: the biggest payoff. Do it after 1–5 so the hooks being reshaped are already smaller.
7. **§5 component splits**, starting with `Composer`. After step 6 these become extract-a-hook refactors with few arguments.

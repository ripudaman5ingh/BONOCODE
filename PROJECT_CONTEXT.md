# MonoCode — Project Context

Deep reference for someone who cannot see the code. Everything below was read from source at v0.6.0 (`package.json`). Paths are relative to the repo root (`monocode/`).

---

## 1. Overview

MonoCode is a Tauri 2 desktop app (React 19 + TypeScript frontend, Rust backend) that gives one UI to many third-party coding-agent CLIs: Claude Code, Codex, Cursor, Grok Build, OpenCode, Pi, omp, fx, Hermes Agent and Antigravity. It does not call model APIs itself. It spawns each provider's CLI as a child process and uses that CLI's machine protocol (stream-json, JSON-RPC, ACP, HTTP+SSE). It then turns the provider's output into one shared `HarnessEvent` stream, and a pure reducer applies that stream to a `Session` transcript. Tabs and split panes hold sessions. Around that core sit git/worktree tooling, a file editor, terminals (PTY), an Inbox for GitHub/GitLab/Azure DevOps/Linear/Jira work items, automations, notes, multi-agent "orchestration", and an experimental remote host. The remote host runs the same harness code headless on another machine.

---

## 2. Folder map

### Top level

| Path | Purpose |
|---|---|
| `src/` | React/TS frontend (Vite). Entry `src/main.tsx` → `src/app/App.tsx`. |
| `src-tauri/` | Rust Tauri app: process supervision, fs/git, SQLite, windows, native integrations. |
| `host/` | Headless Node "MonoCode Host" for remote sessions. Reuses `src/` harness code and is bundled with esbuild into `build/host/monocode-host.mjs`. |
| `vendor/portable-pty/` | Vendored fork of the `portable-pty` crate (PTY for terminals). |
| `scripts/` | Version bump, Linux dep installers, remote SSH test script. |
| `docs/` | `remote-access.md` (remote host user doc), `jira.md`. |
| `public/` | Static assets. |
| `index.html` / `quick-composer.html` | Two Vite entry pages: the main window, and the macOS floating "quick composer". |
| `.github/` | CI workflows, issue/PR templates. |

### `src/` second level

| Path | Purpose |
|---|---|
| `src/app/App.tsx` | 11.4k-line root component. Owns all workspace state and wires every feature together. |
| `src/app/model/` | App-level pure logic: boot/quit lifecycle, harness event flush scheduling, updater, window transfer, submission acceptance. |
| `src/app/shell/` | Window chrome: `TitleBar`, `Sidebar` (sessions/files/changes), `ProjectRail`, usage footer, update cards. |
| `src/integrations/harness/core/` | Provider-independent harness layer: types, registry, child-process bridge, event reducer (`apply.ts`), ACP/JSON-RPC clients, tool previews. |
| `src/integrations/harness/providers/<id>/` | One folder per provider adapter. |
| `src/platform/tauri/` | Thin wrappers over Tauri `invoke` for fs/git, PTY and clipboard. `fs.ts` can reroute to a remote host. |
| `src/shared/` | Feature-free UI primitives (`ui/`), hooks (`hooks/`), utilities (`lib/`). |
| `src/styles/` | Tailwind v4 CSS. |
| `src/instructions/inbox.md` | Prompt text bundled for Inbox flows. |

### `src/features/*` (each one is `ui/`, `model/`, sometimes `hooks/` and `data/`, with tests alongside)

| Feature | Purpose |
|---|---|
| `agent-app` | Backend for the `/operator` "app CLI": lets an agent list models, start/read/send sessions, and manage folders and notes. |
| `automations` | Scheduled and event-triggered prompts. The view and model use Rust `automations.rs`. |
| `connections` | Remote machines: wire protocol types (`model/protocol.ts`), SSH setup UI, `RemoteSession.tsx` (polling client for host sessions). |
| `files` | File tree, CodeMirror editor (`editor/`), file previews, file mentions, file watching. |
| `inbox` | Work items and PRs from GitHub/GitLab/Azure DevOps/Linear/Jira, CI check repair, "Ask" temp sessions. |
| `notes` | Markdown notes stored in SQLite via `notes.rs`. Barrel `index.ts`. |
| `notifications` | OS notifications, dock badge, approval toasts, per-project mute, session reminders. |
| `orchestration` | Lead agent proposes a plan and spawns worker sessions. `Orchestrator` singleton in `model/orchestration.ts`. |
| `projects` | Recents, project picker, logos/mascots/backgrounds, project location resolution. |
| `providers` | Provider accounts (multiple Claude/Codex logins), binary path overrides, rate limits/usage, CLI update notices. |
| `quick-composer` | macOS-only floating composer window (own entry `main.tsx`). |
| `search` | Project-wide search UI over Rust `search.rs`. |
| `sessions` | The core product: `Session`/`Block` model, composer, transcript, model picker, persistence (`data/sessionStore.ts`), plans, handoffs, BTW side-threads, queues. |
| `settings` | Settings view and all localStorage-backed preferences (`model/settings.ts`), appearance, MCP settings. |
| `skills` | Slash commands and skill discovery (`skills.rs`), skill picker. |
| `source-control` | Git changes panel, diffs, branches, worktrees, commit/PR text generation prompts (`model/gitText.ts`). |
| `terminal` | xterm.js terminals over Rust PTY, project terminal dock, plus easter-egg arcade games. |
| `workspace` | Tab and pane layout tree (`model/layout.ts`), tab groups, workspace snapshot persistence. |

---

## 3. Harness layer

Lives in `src/integrations/harness/`. Public barrel: `index.ts`. **Use the registry functions (`sendHarnessTurn`, `cancelHarnessTurn`, …), not the per-provider exports.**

### 3.1 `HarnessAdapter` (`core/registry.ts`)

```ts
export type HarnessAdapter = {
  id: HarnessId;
  /** True when this adapter can run live turns. */
  live: boolean;
  /** False when the harness cannot accept a follow-up while a turn is running. Default: same as live. */
  canSteer?: boolean;
  commands?: NativeCommandProvider;
  sendTurn(input: SendTurnInput): Promise<void>;
  /** Trigger provider-owned compaction outside MonoCode's normal user-turn path. */
  compactContext?(input: CompactContextInput): Promise<void>;
  /** Rewind provider state so the last user turn can be replaced. */
  rewindLastTurn?(input: RewindLastTurnInput): Promise<RewindLastTurnResult>;
  steerTurn(input: SteerTurnInput): Promise<void>;
  cancelTurn(sessionId: string): Promise<void>;
  respondApproval(sessionId: string, requestId: number, decision: ApprovalDecision): void;
  respondQuestion?(sessionId: string, requestId: number, reply: UserQuestionReply): void;
  /** Keep a timed question open once the user starts answering it. */
  keepQuestionOpen?(sessionId: string, requestId: number): void;
  /** Kill the child but keep resume state for later rebind. */
  stopSession(sessionId: string): Promise<void>;
  /** Drop resume state and kill the child (delete, harness switch, idle detach). */
  forgetSession(sessionId: string): Promise<void>;
  /** Seed resume state from a restored MonoCode session. */
  bindSession(threadId: string, providerSessionId: string, cwd: string, providerAccountId?: string): void;
  /** Seed provider task state from a restored session's persisted panels. */
  restoreTaskLists?(threadId: string, lists: TaskListMeta[]): void;
  refreshCatalog?(): Promise<void>;
  generateTitle?(input: TitleInput): Promise<GeneratedSessionTitle | null>;
  generateCommitMessage?(cwd: string, signal?: AbortSignal): Promise<string>;
  generatePrContent?(cwd: string): Promise<(PrContent & { base: string; head: string }) | null>;
  generateBranchName?(cwd: string, message: string): Promise<string | null>;
  warmupText?(cwd: string): Promise<void>;
  /** Run an isolated, read-only prompt without mutating the main session. */
  runTextPrompt?(input: TextPromptInput): Promise<string>;
  stopTextPrompt?(): Promise<void>;
};

export type TitleInput = { sessionId: string; cwd: string; message: string; providerAccountId?: string };

export type TextPromptInput = {
  cwd: string; providerAccountId?: string; model?: string;
  modelSettings?: Record<string, string>; threadId?: string;
  onThreadId?: (threadId: string) => void; intent?: TurnIntent;
  prompt: string; timeoutMs?: number; signal?: AbortSignal;
  onEvent?: (event: HarnessEvent) => void;
};
```

Inputs (`core/types.ts`):

```ts
export type HarnessSessionInput = {
  sessionId: string;            // MonoCode session id (also the child-process key)
  cwd: string;
  model: string;                // MonoCode model id, e.g. "claude:claude-sonnet-5"
  modelSettings?: Record<string, string>;  // effort, fast, thinking, context, …
  providerAccountId?: string;
  runtimeMode: RuntimeMode;     // "supervised" | "auto-accept-edits" | "auto" | "full-access"
  intent?: TurnIntent;          // "default" | "plan" | "build" | "orchestrate"
  controlsAgents?: boolean;     // session drives the loopback control CLI (needs network in sandbox)
  appAccess?: boolean;          // /operator turn: grant scoped app CLI
  onEvent: (event: HarnessEvent) => void;
};
export type SendTurnInput = HarnessSessionInput & {
  text: string;
  attachments?: Attachment[];
  onAccepted?: () => void;      // only codex + pi/omp (piFamily) call this
};
export type CompactContextInput = HarnessSessionInput;
export type SteerTurnInput = { sessionId; cwd; model; modelSettings?; text; attachments? };
export type RewindLastTurnInput = CompactContextInput & { providerTurnId?: string; text?: string; attachments?: Attachment[] };
export type RewindLastTurnResult = { submitted: boolean };
export type ApprovalDecision = "allow" | "deny";
```

### 3.2 `HarnessEvent` (`core/types.ts`)

```ts
export type HarnessEvent =
  | { type: "session.started" }
  | { type: "session.ended"; code?: number | null }
  | { type: "session.error"; message: string }
  | { type: "session.providerBound"; providerSessionId: string }
  | { type: "turn.started"; providerTurnId: string }
  | { type: "session.configChanged"; model?: string; modelSettings?: Record<string, string> }
  | { type: "status"; text: string }
  | { type: "usage.limited"; resetsAt?: number }
  | { type: "background.updated"; tasks: string[] }          // agent yielded, background work still running
  | ({ type: "interjection"; text: string } & InterjectionMeta)
  | { type: "message.delta"; text: string }
  | { type: "message.completed" }
  | { type: "image.generated"; itemId: string; data: string; name: string; alt?: string }
  | { type: "image.generated"; itemId: string; path: string; name: string; mimeType: string; size: number; alt?: string }
  | { type: "reasoning.delta"; text: string }
  | { type: "reasoning.completed" }
  | { type: "tool.started"; agentModel?; callId: string; title: string; kind?; status?; background?: boolean; preview?: ToolPreview; paths?: string[] }
  | { type: "tool.updated"; agentModel?; callId: string; title?; kind?; status?; detail?; preview?: ToolPreview; paths?: string[] }
  | { type: "agent.step"; callId: string; stepId: string; kind: AgentStepKind; text: string; toolKind?; status?; detail?; preview?; agentName?; agentType? }
  | { type: "approval.requested"; requestId: number; title: string; kind?; callId?; preview?: ToolPreview }
  | { type: "approval.resolved"; requestId: number; decision: "allow" | "deny" | "cancelled" }
  | { type: "question.asked"; requestId: number; title?; questions: UserQuestion[]; callId?; autoResolveAt?: number }
  | { type: "question.updated"; requestId: number; autoResolveAt?: number }
  | { type: "question.resolved"; requestId: number; decision: "answered" | "skipped" | "cancelled" }
  | { type: "tasks.updated"; key?; explanation?; merge?: boolean; authoritative?: boolean; providerSessionId?; items: TaskListItem[] }
  | { type: "plan"; text: string; key?: string; append?: boolean; streaming?: boolean }
  | { type: "context"; used?: number; window?: number }
  | ({ type: "turn.metrics" } & TurnMetrics);
```

`apply.ts` ignores `session.started`, `session.ended` and the base64 `data` variant of `image.generated` (the `default:` branch). `App.tsx` reacts to them in the per-turn event router instead.

### 3.3 Registry behaviour (`core/registry.ts`)

- `adapters: Map<HarnessId, HarnessAdapter>`. `registerBuiltinHarnesses()` (`core/register.ts`) calls `ensure<X>Registered()` for all 10 providers, idempotently.
- **Per-session serialization.** `sendHarnessTurn`, `compactHarnessContext` and `rewindHarnessLastTurn` run through `queueSessionOperation(sessionId, op)`, a promise tail per session. `steerHarnessTurn` uses a separate steer tail and skips the barrier while a turn is active (`activeTurnSessions`), so a live turn can be steered.
- **Idle parking.** After each send/compact/rewind/cancel, `scheduleIdlePark` calls `stopHarnessSession` after `HARNESS_IDLE_PARK_MS = 5 min`. That kills the child but keeps resume state, so the next prompt respawns with `--resume`.
- **Control gate (Tauri only).** `sendHarnessTurn` calls `invoke("control_authorize_turn", {sessionId, cwd, appAccess})` before the turn and `invoke("control_turn_finished")` after it. This opens and closes the window in which the agent's `app`/`control` CLI is allowed to act.
- `refreshHarnessCatalogs(ids, {force})` only probes the requested harnesses. A comment explains why: probing everything at boot spawned ~1 GB of Pi processes.
- `runHarnessTextPrompt` does isolated one-shot prompts (titles, BTW side questions) with AbortSignal support and owner tracking.

### 3.4 Child process bridge (`core/child.ts`)

```ts
export interface ChildBackend {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
}
export function configureChildBackend(next: ChildBackend): void;   // host only; must run before bridge starts
export function startHarnessBridge(): () => void;                   // ref-counted global listeners
export function spawnChild(sessionId, command, args, cwd, account?, binaryProvider?): Promise<void>;
export function watchChild(sessionId, onLine, onExit, onStderr?): void;
export function writeChild(sessionId, line): Promise<void>;          // invoke("harness_write")
export function killChild(sessionId): Promise<void>;
export function execChild(command, args, cwd?, binaryProvider?, binaryPathOverride?): Promise<string>;
export function harnessHttp({url, method, headers, body, timeoutMs}): Promise<{status; body}>;
export function openHarnessSse(sessionId, url, headers?) / watchSse / closeHarnessSse;
export function resolveClaudeBinary(...) / resolveCodexBinary(...) / ...;  // → harness_resolve_<id>
```

- Without a configured backend it uses Tauri `invoke`/`listen`. The host injects `HostChildBackend` (Node `child_process`).
- One global set of listeners for the Tauri events `harness-stdout`, `harness-stderr`, `harness-exit`, `harness-sse` and `harness-sse-end`, all keyed by `sessionId`, dispatched to the per-session handler maps.
- Lines that arrive before `watchChild` are buffered (max 1000 per session).
- Exit events are matched by **pid** (`isCurrentChildExit`) so a stale exit from a previous child cannot kill the new session. Exits that arrive before `spawnChild` resolves are held in `pendingExit`.
- Rust side (`src-tauri/src/harness.rs`, `HarnessHost`): `harness_spawn` forks with the GUI env fix (`apply_gui_env` reads the login shell env). It sets `CLAUDE_CONFIG_DIR` / `CODEX_HOME` for non-default provider accounts and streams stdout lines as `harness-stdout`. `harness_write` runs on the blocking pool because a wedged child stdin can block for minutes.

### 3.5 Turn flow end to end

```
Composer.tsx  (features/sessions/ui)
  └─ props.onSubmit(text, attachments, options)
SessionPane.tsx → onSubmit(session.id, …)
App.tsx  onSubmit → submitSession(sessionId, text, attachments, options)      (~line 5901)
  ├─ remote cwd?  → remoteSessionActions(sessionId).submit(...)  (host path, §8)
  ├─ guards: orchestrator.submissionError, busy, worktree removal, edited resend…
  ├─ setSessions: appendUser(...) + busy: true   (apply.ts helpers)
  ├─ prepareAttachments / preparePrompt / plan/orchestration/handoff prompt wrapping
  ├─ /operator → append <monocode_app> instructions with `app_cli_path`
  └─ sendHarnessTurn({ harness, sessionId, cwd: workCwd, model, modelSettings,
                       providerAccountId, runtimeMode, intent, controlsAgents,
                       appAccess, text, attachments, onEvent: routeTurnEvent })
registry.sendHarnessTurn
  ├─ queueSessionOperation(sessionId)
  ├─ cancelIdlePark; invoke("control_authorize_turn")
  └─ adapter.sendTurn(input)                      e.g. claude.ts sendClaudeTurn
adapter
  ├─ ensureLive(): resolve binary → watchChild(onLine,onExit) → spawnChild(args)
  │     → handshake (claude: control_request{subtype:"initialize"})
  │     → emit session.providerBound, session.started
  ├─ runTurn(): writeChild(JSON user message) → await turn promise
  └─ handleLine(): parse protocol line (claudeProtocol.ts pure fns) → live.onEvent(HarnessEvent)
Rust harness.rs  — stdout → emit "harness-stdout" {sessionId,line} → child.ts → handleLine
App.tsx routeTurnEvent(event)
  ├─ drop if turnGen.current.get(sessionId) !== gen  (stale turn)
  ├─ side effects: nudgeOpenEditors, trackSessionEdits, plan routing, handoff reveal
  └─ enqueueHarnessEvent(sessionId, event)
        ├─ approval/question events → applyApprovalEvent (synchronous, flushes queue first)
        └─ else queue; scheduleHarnessFlush(flushHarnessEvents, foreground)
              rAF when visible, 100 ms timeout when hidden (app/model/harnessFlush.ts)
flushHarnessEvents → applyHarnessEvents(session, events) → sessionsRef.current = next; setSessions(next)
apply.ts  (pure reducer Session × HarnessEvent → Session; coalesces consecutive deltas)
UI: SessionPane → AgentTranscript renders session.blocks
Turn end: sendTurn resolves → App stopStreaming(session) (busy false, seal blocks, stamp duration)
          → registry finally: control_turn_finished, scheduleIdlePark
Persistence: effect diffs persistFingerprint → upsertSession → invoke("session_upsert")
```

User actions while a turn runs go through the registry: `cancelHarnessTurn`, `respondHarnessApproval` (approval card), `respondHarnessQuestion` (AskUserQuestion), and `steerHarnessTurn` (send while busy, if `canSteerHarness`).

### 3.6 Transport per provider

| Provider | Spawn | Protocol |
|---|---|---|
| claude | `claude --output-format stream-json --input-format stream-json --verbose …` | Claude stream-json over stdio plus `control_request`/`control_response` (permissions via `--permission-prompt-tool stdio`) |
| codex | `codex app-server` | JSON-RPC (`core/jsonRpc.ts`) |
| cursor | `cursor-agent acp` | ACP (`core/acp.ts` `AcpClient`) |
| grok, hermes, fx, antigravity | `<cli> acp` (fx adds `--model`) | ACP |
| opencode | `opencode serve --hostname=127.0.0.1 --port=<free>` | HTTP (`harnessHttp`) + SSE (`openHarnessSse`), both proxied through Rust |
| pi, omp | `pi --mode rpc` | JSONL RPC; omp reuses `providers/pi/piFamily.ts` with `OMP_FLAVOR` |

Text-generation helpers (titles, commit/PR text) prefer `TEXT_HARNESSES = ["claude","cursor","codex","grok","opencode"]` (`core/textHarness.ts` `pickTextHarness`).

---

## 4. Provider walkthrough: Claude (`src/integrations/harness/providers/claude/`)

| File | Lines | Role |
|---|---|---|
| `claudeAdapter.ts` | 57 | Builds the `HarnessAdapter` object from the functions below. `ensureClaudeRegistered()` calls `registerHarness` once. |
| `claude.ts` | 1821 | Live session state machine: spawn, init handshake, turn lifecycle, line dispatch, approvals/questions, subagents, background tasks, cancel/stop/forget/bind. |
| `claudeProtocol.ts` | 1193 | **Pure** helpers: spawn args, message builders, parsers for each stream-json record type, tool → kind/title/preview mapping, permission mode mapping, version gates. Unit-tested in `claudeProtocol.test.ts`. |
| `claudeCatalog.ts` | 581 | Static `CLAUDE_MODEL_CATALOG` plus `refreshClaudeCatalog()`. Discovery spawns a probe child and asks `list_models` over the control channel, falling back to version-gated lists (`modelsForClaudeVersion`). Results go to `setHarnessModels("claude", …)` in `features/sessions/model/models.ts`. |
| `claudeText.ts` | 447 | Separate long-lived **isolated** child (`TEXT_CHILD_ID = "monocode-claude-text"`, default model `claude-haiku-4-5`, `--no-session-persistence`, empty MCP config, hooks disabled) for one-shot prompts: `runClaudeTextPrompt`, `warmupClaudeText`, `stopClaudeTextPrompt`. |
| `claudeTitle.ts` | ~30 | `generateClaudeSessionTitle` = `runClaudeTextPrompt(buildThreadTitlePrompt(msg))` → `parseGeneratedSessionTitle`. |
| `claudeGit.ts` | ~110 | Commit message, PR content and branch name. Gathers git context via `platform/tauri/fs` (`gitStagedContext`, `gitRangeContext`), prompts via `claudeText`, parses with `features/source-control/model/gitText.ts`. |
| `claudeLive.test.ts` | 1977 | Scripted end-to-end tests of `claude.ts` with `core/child` mocked (see §9). |
| `claudeProtocol.test.ts` | 987 | Pure parser tests. |

### Module state in `claude.ts`

```ts
const liveByThread   = new Map<string, Live>();    // running child per MonoCode session
const resumeByThread = new Map<string, Resume>();  // { sessionId (Claude's), cwd, providerAccountId } survives stop
const tasksByThread  = new Map<string, { providerSessionId; tasks: Map<string, TaskListItem> }>();
const cancelledThreads = new Set<string>();        // cancel arrived before Live existed
```

`Live` holds the cwd, the Claude session id, `settingsKey`, the pending `approvals`/`questions` maps (UI numeric id → Claude string request id), in-flight tools keyed by stream index and id, `agentTasks`/`backgroundTasks`, the `turnDone`/`turnFailed` resolvers, emitted-text trackers and compaction flags.

### Lifecycle

1. **`sendClaudeTurn`** → `ensureLive(input)`. It reuses the existing `Live` when `cwd`, `settingsKey` and the `planning` flag match. Otherwise it stops the old child and respawns. A cwd change also drops resume. `settingsKey = providerAccountId + claudeSettingsKey({model, effort, fast, thinking, context, runtimeMode, hooks})`, so **changing the model, effort or permission mode respawns the CLI with `--resume <id>`**.
2. `launchOptions` → `buildClaudeSpawnArgs`: `--setting-sources=user,project,local --settings <json> --model --effort --permission-mode (plan | default | acceptEdits | auto | bypassPermissions) [--resume | --session-id <uuid>]`. MonoCode pre-assigns a UUID as the Claude session id for new conversations.
3. `spawnChild(sessionId, path, args, cwd, {provider:"claude", id: account}, "claude")`, then write `control_request {subtype:"initialize"}` and `waitForInit` (8 s). Emits `session.providerBound` and `session.started`.
4. **`runTurn`** resets per-turn state, writes `buildClaudeUserMessage({text, attachments, effort})` and awaits `turnDone`.
5. **`handleLine`** dispatches by `type`: `keep_alive` (ignored); control cancel → resolve the pending approval as `"cancelled"`; `control_request` → `handleControlRequest`; `system` (init, status, compact boundary, task_* lifecycle); `stream_event` → deltas and tool starts; `assistant` → full message blocks; `user` → tool results; `result` → turn end, metrics and context; `rate_limit_event` → `usage.limited`.
6. **Approvals.** `can_use_tool` control requests become `approval.requested` (or `question.asked` for `AskUserQuestion`; `ExitPlanMode` becomes a `plan` event). They wait on `respondClaudeApproval`, then write `control_response` via `toClaudePermissionResult`.
7. **Turn end.** The `result` record ends the turn, unless background tasks (subagents, backgrounded shells) are still running. In that case `background.updated` is emitted and the turn stays open until their notifications arrive (`RESUME_GRACE_MS = 15 s`).
8. **Cancel** sends `stop_task` for each background task, then `interrupt`, and resolves pending approvals as deny. **Stop** kills the child but keeps `resumeByThread`. **Forget** also clears resume and tasks.
9. **Compact** = a `runTurn` with the text `/compact`. It throws unless a `system` compact status confirms it.

---

## 5. Session data model & persistence

### 5.1 Key types (`src/features/sessions/model/session.ts`)

```ts
export type HarnessId = "claude" | "codex" | "cursor" | "grok" | "opencode" | "pi" | "omp" | "fx" | "hermes" | "antigravity";
export type BlockRole = "user" | "assistant" | "image" | "reasoning" | "tool" | "approval" | "tasks" | "plan" | "system" | "handoff";
export type RuntimeMode = "supervised" | "auto-accept-edits" | "auto" | "full-access";
export type TurnIntent = "default" | "plan" | "build" | "orchestrate";

export type Block = {
  id: string;
  role: BlockRole;
  text: string;
  image?: GeneratedImageMeta;
  attachments?: Attachment[];
  streaming?: boolean;
  startedAt?: number; durationMs?: number;            // user-turn timing
  turnModel?: TurnModel;                               // {harness,id,name} at submit
  providerTurnId?: string;                             // for edit/rewind
  draft?: boolean;                                     // saved, unsent user turn
  monocode?: boolean;                                  // /operator turn
  intent?: "plan" | "orchestrate";
  appRequestId?: string;
  turnMetrics?: TurnMetrics;
  tool?: { callId?; title?; kind?; status?; detail?; preview?: ToolPreview; background?: boolean };
  approval?: { requestId: number; decided?: "allow" | "deny" | "cancelled" };
  agentRun?: AgentRunMeta;                             // subagent trail on Agent/Task tool block
  taskList?: TaskListMeta;
  plan?: PlanBlockMeta;                                // status streaming|ready|building|built
  orchestration?: OrchestrationProposal;
  orchestrationLeadId?: string;
  internal?: boolean;                                  // app-authored turn hidden in transcript
  handoff?: HandoffMeta;
  secondOpinion?: SecondOpinionMeta;
  btwThreads?: BtwThread[];                            // "by the way" side conversations
  noteCard?: NoteCardMeta;
  ciContext?: string;
  interjection?: InterjectionMeta;
  notice?: "error" | "interrupt";
};

export type Session = {
  id: string;
  harness: HarnessId;
  model: string;                        // "<harness>:<native id>"
  modelSettings: Record<string, string>;
  runtimeMode: RuntimeMode;
  title: string;                        // "claude · <title>" — harness-prefixed
  cwd: string;                          // project identity
  worktreeCwd?: string;                 // actual working copy; use sessionWorkCwd(session)
  blocks: Block[];
  providerSessionId?: string;           // provider's conversation id, used to resume
  providerAccountId?: string;
  context?: ContextUsage;
  branch?: string;
  linkedWorkItem?: LinkedWorkItem;
  automationId?: string;
  orchestrationLeadId?: string;
  // ---- in-memory only ----
  busy?: boolean;
  backgroundTasks?: string[];
  queuedMessages?: QueuedMessage[]; queueStatus?: MessageQueueStatus; editingQueuedMessageId?: string;
  usageLimit?: UsageLimit;
  pendingSwitch?: PendingHarnessSwitch; // provider changed in picker; handoff on next send
  pendingQuestion?: UserQuestionPrompt;
  workspaceMode?: WorkspaceMode; worktreeBase?: string; worktreePreparing?: boolean; worktreeRemoved?: boolean;
  composerSeed?: string; inboxCard?; linkedWorkItemUpdateCard?; noteCard?; handoffCard?;
  inboxAsk?: InboxAskContext;           // temp Inbox conversation, never persisted
  quickLaunchAccepted?: boolean;
};
```

Constructors and helpers: `newSession`, `newDefaultSession`, `newSessionForProject` (applies per-project provider defaults), `retargetSessionToProject`, `titleFromPrompt`, `sessionWorkCwd`, `sessionNeedsInput`, `hasPendingApproval`.

### 5.2 Persistence

Frontend `src/features/sessions/data/sessionStore.ts`:

- `shouldPersistSession(s)`: not `inboxAsk`, not a remote path, not `"~"`, and has at least one `user` block. Blank tabs stay ephemeral.
- `sanitizeSessionForPersist` is a **whitelist** of persisted fields. Attachments go through `persistableAttachment`, which drops `data` and `previewUrl`.
- `upsertSession(session)` → `enqueueSessionWrite` (per-session queue) → `invoke("session_upsert", {session})`. It returns a `SessionSummary` for the sidebar.
- `persistFingerprint(session)` decides whether a save is needed. It is JSON of the header fields plus **object identity of each block** (WeakMap tokens). Blocks must be replaced immutably or changes never save.
- `getSession(id)` → `session_get`, then backfills (Claude shell commands, Codex command presentation, Cursor subagents, omp interjections).
- `replaceInFlightSessions` / `takeInFlightSessions` record busy sessions at quit so the next boot can resume them.
- `saveWorkspaceSnapshot` / `loadWorkspaceSnapshot` store tabs/layout JSON in a single row.
- `session_search` does a LIKE search over titles and blocks, with cancellation tokens (`cancelSessionSearch`).

Rust `src-tauri/src/session_store.rs` (3.5k lines):

- DB at `<app_data_dir>/monocode.db`. One write `Connection` in a `Mutex` with WAL and foreign keys on, plus a second read-only `read_conn` (`query_only`, `busy_timeout 5000`) for reads and search.
- Base table:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, cwd TEXT NOT NULL, harness TEXT NOT NULL, model TEXT NOT NULL,
  model_settings TEXT NOT NULL DEFAULT '{}', runtime_mode TEXT NOT NULL, title TEXT NOT NULL,
  provider_session_id TEXT, blocks_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
```

- Later migrations (`schema_migrations` versions 1–18 in `migrate()`, plus `ensure_session_column` calls) added `branch`, `context_used`, `context_window`, `archived`, `pinned`, `worktree_cwd`, `provider_account_id`, `worktree_removed`, `is_draft`, `linked_work_item`, `automation_id`, `inbox_ask`, and several covering indexes. Other tables: `in_flight_sessions`, `workspace_snapshot` (single row, `id = 1`), `worktree_removals`, `orchestration_runs`, `orchestration_sidebar`, `orchestration_workers`. Notes, automations and reminders tables live in the same DB, owned by their modules.
- **The transcript is one JSON blob (`blocks_json`) rewritten on every upsert.**
- Startup: `session_store::init` runs in Tauri `setup`, then `worktrees::reconcile_removals`.

To add a persisted Session field you touch: the `Session` type → `sanitizeSessionForPersist` / `persistableMeta` → `SessionUpsertPayload` / `SessionRecord` (TS) → `SessionUpsert` / `SessionRecord` (Rust) → a new migration `if current < 19` → `upsert_session` / `get_session` / `list_by_project` SQL → the restore mapping in `getSession`.

---

## 6. Rust side — every Tauri command (`src-tauri/src/lib.rs` `generate_handler!`)

`main.rs` is also a CLI: `monocode control …` → `control_cli::run` (orchestration workers), `monocode app …` → `control_cli::run_app` (`/operator` agent CLI), plus an SSH askpass mode. Managed state: `HarnessHost`, `PtyHost`, `RemoteConnections`, `WindowTransferState`, `SessionStore`, plus control, checkpoint and reminder stores.

### remote (`remote.rs`, `remote_ssh.rs`)
- `remote_machines`: list saved machines (no tokens).
- `remote_connect`: pair with a host by URL and token, then store it in `remote-machines.json`.
- `remote_disconnect`: remove a machine, optionally revoking its credential on the host.
- `remote_request`: proxy one JSON-RPC call (`/rpc`) to a host with the stored bearer token.
- `remote_ssh_begin`: start the SSH bootstrap job (download host, install service, pair, tunnel).
- `remote_ssh_reconnect`: re-open the SSH tunnel for a saved machine.
- `remote_ssh_poll`: poll setup job progress or prompts.
- `remote_ssh_answer`: answer an SSH host-key or password prompt.
- `remote_ssh_cancel`: cancel a setup job.

### control (`control.rs`): authenticated loopback for agent CLIs
- `control_enable` / `control_disable`: start or stop the control grant for an orchestration lead session.
- `control_reply`: reply to a pending CLI request that the window executed.
- `control_save` / `control_load`: persist and load orchestration control state.
- `control_scopes`: list the write scopes granted to workers.
- `control_write_path`: resolve a reported write path (symlink-safe) against scopes.
- `control_attach_worker`: bind a worker session to its lead.
- `control_authorize_turn`: open the per-turn window for app/control CLI access (called by the registry).
- `control_turn_finished`: close that window.
- `app_cli_path`: path of the binary used as the `app` CLI.

### app basics (`lib.rs`)
- `default_cwd`: process cwd, else home. `home_dir`: home directory.
- `set_traffic_lights_visible`, `set_window_background_blur`, `set_dock_badge`: native window and dock tweaks.
- `open_new_window`: open another workspace window.

### notifications / reminders
- `notification_permission`, `request_notification_permission`, `show_notification`, `open_notification_settings`.
- `reminder_list`, `reminder_set`, `reminder_clear`: per-session reminders in SQLite.
- `reminder_configure`: reminder settings. `reminder_register_window`: window that receives reminder opens.
- `reminder_open` / `reminder_take_open`: queue and claim "open this session" from a fired reminder.

### automations (`automations.rs`)
- `automations_list`, `automations_upsert`, `automations_delete`: CRUD.
- `automation_runs_list`: run history. `automation_runs_recover`: recover runs interrupted by a quit.
- `automation_run_now`: manual trigger. `automations_claim_due`: claim schedule-due runs (one window wins).
- `automations_claim_event`: claim event-triggered runs (e.g. Inbox). `automation_run_update`: update run status.

### external editor
- `list_external_editors`: detect installed editors. `open_in_external_editor`: open a path in one.

### fs (`fs.rs`, 8.6k lines: files, git, GitHub)
- Files: `resolve_project_location`, `open_path_with_default_app`, `list_dir`, `list_project_files`, `create_path`, `rename_path`, `delete_path`, `copy_path`, `move_path`, `reveal_path`, `clone_repo`, `read_file_preview`, `stat_files`, `inspect_paths`, `read_file_base64`, `read_binary_file`, `read_text_file`, `write_text_file`, `write_attachment` (stage a composer attachment), `save_generated_image`, `delete_generated_images`.
- Provider transcript readers: `omp_session_interjections`, `omp_active_assistant_texts`, `claude_shell_commands` (restore data from provider-owned files).
- Git status/diff: `git_diff_stats`, `git_diff_index`, `git_diff_files`, `git_file_diff`, `git_history`, `git_commit_files`, `git_commit_file_diff`.
- Git staging: `git_stage_file`, `git_stage_contents` (stage partial content), `git_unstage_file`, `git_discard_file`, `git_discard_all`, `git_stage_all`, `git_unstage_all`.
- Git actions: `git_commit`, `git_head_message`, `git_push`, `git_pull`, `git_sync`, `git_branches`, `git_checkout`, `git_create_branch`, `git_stash`.
- LLM context: `git_staged_context` (staged summary and patch for commit messages), `git_range_context` (branch range for PR text).
- PR/GitHub (via `gh`): `git_pr_status`, `git_pr_create`, `git_github_status`, `git_github_repo`, `git_github_repositories`, `git_github_work_item`, `git_github_work_items`, `git_github_work_item_details`, `git_github_work_item_thread`, `git_github_work_item_comment`, `git_github_pr_action`, `git_github_pr_diff`, `git_github_pr_checks`, `git_github_check_details`, `github_monocode_star_status`, `github_star_monocode`.

### inbox integrations
- `fetch_inbox_media`: proxy images in work-item bodies.
- GitLab: `gitlab_status`, `gitlab_set_config`, `gitlab_repo`, `gitlab_list_work_items`, `gitlab_list_todos`, `gitlab_work_item_details`, `gitlab_work_item_thread`, `gitlab_work_item_comment`, `gitlab_mr_diff`.
- Azure DevOps: `azure_devops_status`, `azure_devops_set_config`, `azure_devops_repo`, `azure_devops_list_work_items`, `azure_devops_list_todos`, `azure_devops_work_item_details`, `azure_devops_work_item_thread`, `azure_devops_work_item_comment`, `azure_devops_mr_diff`.
- Linear: `linear_status`, `linear_set_token`, `linear_list_teams`, `linear_list_issues`, `linear_issue_details`, `linear_issue_thread`, `linear_issue_comment`.
- Jira: `jira_status`, `jira_set_config`, `jira_list_projects`, `jira_list_issues`, `jira_issue_details`, `jira_issue_thread`, `jira_issue_comment`.
- `fetch_link_preview`: OpenGraph preview for links in user messages.

### worktrees (`worktrees.rs`)
- `git_worktrees`: list. `git_worktree_create`: create on a new or existing branch. `git_worktree_rename_branch`: rename an auto-named branch after the first turn.
- `git_worktree_check_remove`: preflight (dirty, sessions). `git_worktree_remove`: remove and record in `worktree_removals`.
- `git_orchestration_worktree_create` / `_remove`, `git_orchestration_branch_remove`: per-worker worktrees.

### clipboard (`pasteboard.rs`)
- `clipboard_file_paths`, `clipboard_image`, `copy_file_to_clipboard`.

### skills / search / cursor store
- `list_skills`: discover skills and slash commands on disk.
- `search_project` / `cancel_project_search`: content search.
- `cursor_tool_calls`, `cursor_subagent_runs`: read Cursor's local store to recover tool and subagent detail.

### harness (`harness.rs`, `harness_updates.rs`, `mcp.rs`)
- `harness_resolve_{claude,codex,cursor,grok,opencode,pi,omp,fx,hermes,antigravity}`: locate each CLI (with guards such as "never Grok's `agent` shim", "never the fx JSON viewer").
- `harness_resolve_configured`: validate a user-configured binary path. `harness_runtime_binary_paths`: effective paths.
- `harness_spawn`: fork a child keyed by sessionId, returns its pid. `harness_write`: write a stdin line. `harness_kill`, `harness_kill_all`.
- `harness_exec`: one-shot stdout capture (`--version`, `--list-models`). `harness_free_port`: free loopback port for `opencode serve`.
- `harness_http`: HTTP proxy for OpenCode. `harness_sse_open` / `harness_sse_close`: SSE stream → `harness-sse` events.
- `harness_latest_version`, `harness_update_check_claim` (first window only), `harness_update` (run the CLI's self-update).
- `provider_account_remove`: delete a named provider account directory. `provider_account_identity`: read the logged-in identity.
- `claude_mcp_list`, `claude_mcp_add`, `claude_mcp_remove`: Claude MCP config. `mcp_discover`, `mcp_add`: generic MCP config. `mcp_provider_login`: OAuth login for an MCP server.
- Usage: `fetch_pi_usage`, `fetch_claude_usage`, `fetch_opencode_go_usage`.

### pty (`pty.rs`)
- `pty_spawn`, `pty_write`, `pty_resize`, `pty_status` (foreground process title via `ps`), `pty_kill`, `pty_kill_all`.

### session_store: see §5
- `session_upsert`, `session_list_by_project`, `session_rebase_project` (project moved), `session_list_linked` (sessions with linked work items), `session_search`, `cancel_session_search`, `session_get`, `session_delete`, `session_set_archived`, `session_set_pinned`, `session_set_linked_work_item`, `session_set_in_flight`, `session_list_in_flight`, `session_take_in_flight`, `workspace_set_snapshot`, `workspace_get_snapshot`.

### notes (`notes.rs`)
- `notes_list`, `notes_get`, `notes_upsert`, `notes_delete`, `notes_save_image`, `notes_image_path`.

### checkpoint (`checkpoint.rs`): per-session file snapshots for "changes this session made" and undo
- `session_checkpoint_ensure` (create the store for a session), `_prepare` (snapshot before a turn), `_capture` (after a turn), `_status` (files changed, with `exact`/`undoable`), `_apply`, `_file_diff` (original vs current), `_undo` (restore files), `_keep` (accept), `_forget`, `_cleanup_safe`.

### window / menu / misc
- `keybindings_set_overrides`, `autosave_set_enabled` (macOS menu).
- `hide_window` (close with a running chat hides instead), `destroy_window`, `quit_poll_reply` / `quit_decision` / `quit_ready` (multi-window quit coordination), `set_window_glass_enabled`.
- macOS quick composer: `quick_composer_set_enabled`, `_prepare`, `_fit`, `_submit`, `_take`, `_ack`, `_capture`, `_release_capture`, `quick_git_open`, `quick_git_state`, `quick_git_fit`, `quick_git_complete`, `quick_composer_dismiss`.
- `stage_window_transfer` / `take_window_transfer`: move tabs and sessions between windows.
- `save_chat_background`, `remove_chat_background`, `save_project_chat_background`, `remove_project_chat_background`, `save_project_logo`, `remove_project_logo`, `forget_logo_file`.

---

## 7. Frontend patterns

### State management
- **No Redux, Zustand or Context store.** Workspace state is plain `useState` inside `Workspace` in `src/app/App.tsx`: `sessions`, `tabs`, `activeTabId`, `projectCwd`, `projectTerminals`, about 68 `useState`/`useRef` calls in all.
- **Ref mirrors.** Async callbacks read `sessionsRef.current`, `tabsRef.current`, `activeTabIdRef.current` and so on, never stale closures. When you update sessions outside React's updater, set both (`sessionsRef.current = next; setSessions(next)`, see `flushHarnessEvents`).
- **Generation counter.** `turnGen.current: Map<sessionId, number>` is bumped on stop or removal. Every async continuation in a turn checks `turnGen.current.get(sessionId) !== gen` and bails out.
- **Module-level stores with `useSyncExternalStore`.** Model catalog (`sessions/model/models.ts`: `subscribeModels` / `getModelSnapshot` / `setHarnessModels`), settings flags (`settings/model/settings.ts`: `subscribeNotesEnabled` etc., backed by `localStorage` keys like `monocode.quickComposerEnabled` plus a `window` CustomEvent), `orchestrator` (singleton class in `orchestration/model/orchestration.ts`), harness availability (`subscribeHarnessAvailability`).
- **Pure model functions.** Business logic lives in `features/*/model/*.ts` as pure functions taking and returning immutable objects, e.g. `applyHarnessEvent(session, event): Session` and `appendUser(session, …)`. UI components are thin.

### How features talk
- Mostly **through `App.tsx` props/callbacks** (e.g. `onSubmit`, `onApproval`, `onOpenFile`, `onHandoff`, `onBuildPlan`), passed down to `SessionPane`, `Sidebar`, `TitleBar`, `PaneTree` and the others.
- Direct imports of other features' `model/` modules are common (sessions ↔ inbox ↔ notes ↔ orchestration types).
- Cross-window and native events use Tauri `emit`/`listen` with `monocode:*` event names (e.g. `monocode:automations-changed`, `monocode:reminders-changed`).
- In-window broadcast uses `window.dispatchEvent(new CustomEvent(NAME))` for settings changes (`KEYBINDINGS_CHANGE_EVENT`, `PROJECT_PROVIDERS_CHANGE_EVENT`, `"monocode:open-mcp-settings"`, …).
- Tauri calls go through `src/platform/tauri/fs.ts` (which can redirect to a remote host for `remote://` paths via `remoteRunner`), or call `invoke` directly from feature `model/` files (about 47 feature files do this).

### `App.tsx` wiring
- `src/main.tsx` does boot: appearance, sounds, home dir, provider binary paths, `loadBootWorkspace`, then dynamically imports `App`.
- `App` = `<Suspense><Workspace …/></Suspense>`. `AppProps` carry `windowTransfer`, `resumed` (restored snapshot), `installedUpdate` and boot history.
- Heavy surfaces load lazily with `lazySurface(() => import(...))`: `SearchView`, `SettingsView`, `InboxView`, `NotesView`, `AutomationsView`, `LinkedWorkItemPanel`.
- Effects at mount: `bindResumedSessions` → `bindHarnessSession` per session; `startHarnessBridge()`; `probeHarnessAvailability()`; `refreshHarnessCatalogs(harnesses in this window)`; `pagehide`/`beforeunload` → `persistQuitState` + `reapWindowRuntime`.
- Render tree: `TitleBar` → `ProjectRail` + `Sidebar` → per tab `PaneTree` (from `WorkspaceTab.layout`) → `SessionPane` per leaf (Composer + AgentTranscript), with editor and terminal panes alongside.
- Layout model (`features/workspace/model/layout.ts`):

```ts
export type LayoutNode =
  | { type: "leaf"; id: string }                                  // id = session id
  | { type: "split"; id: string; dir: "right" | "down"; children: LayoutNode[]; sizes: number[] };
export type WorkspaceTab = {
  kind: "session"; id: string; layout: LayoutNode; focusedId: string;
  editorPanes: EditorPane[]; terminalPanes: EditorPane[];
  diffOpen?: boolean; diffFocused?: boolean; groupId?: string;
};
```

### Naming conventions
- Files: React components `PascalCase.tsx`; logic `camelCase.ts`; tests `<name>.test.ts` beside the source (UI tests also `.test.ts`, using `createElement`, not JSX).
- Provider files: `<id>.ts` (live session), `<id>Adapter.ts`, `<id>Protocol.ts` (pure), `<id>Catalog.ts`, `<id>Text.ts`, `<id>Title.ts`, `<id>Git.ts`, `<id>Live.test.ts` (mocked child), `<id>Real.test.ts` / `<id>Soak.test.ts` (real CLI, env-gated).
- Provider function names: `send<X>Turn`, `cancel<X>Turn`, `respond<X>Approval`, `stop<X>Session`, `forget<X>Session`, `bind<X>Session`, `refresh<X>Catalog`, `generate<X>SessionTitle`.
- Registry function names: `<verb>Harness<Noun>` (`sendHarnessTurn`, `canSteerHarness`).
- App callbacks: `on<Action>` (`onSubmit`, `onCloseTab`). Load/save pairs: `load<X>` / `save<X>` / `subscribe<X>`.
- Rust commands: `snake_case`, grouped by module prefix (`git_*`, `session_*`, `harness_*`). Args are camelCase on the TS side (Tauri converts).
- Model ids are namespaced `"<harness>:<native>"`. `nativeModelId()` strips the prefix.
- Comments explain *why* (usually a past bug), in full sentences. Match that density.

---

## 8. Remote host (`host/`)

### Reuse of harness code
- `host/cli.ts` (the entry) creates `HostChildBackend` (`host/child-backend.ts`, implements `ChildBackend` with Node `child_process`, an EventEmitter for `harness-*` events and `fetch` for OpenCode HTTP/SSE). It calls **`configureChildBackend(backend)`** and then `acquireHarnessBridge()`. From then on **every provider module in `src/integrations/harness/providers/*` runs unmodified** on Node.
- `host/providers.ts` maps each provider to a separate, smaller interface (it does not use `HarnessAdapter`/the registry):

```ts
export interface HostProvider {
  send(input: SendTurnInput): Promise<void>;
  compact?(input: CompactContextInput): Promise<void>;
  cancel(id: string): Promise<void>;
  stop(id: string): Promise<void>;          // NOTE: wired to forget<X>Session, not stop<X>Session
  bind(id: string, providerId: string, cwd: string): void;
  approve(id: string, request: number, decision: ApprovalDecision): void;
  answer(id: string, request: number, reply: UserQuestionReply): void;
  generateTitle?(input: { sessionId; cwd; message }): Promise<GeneratedSessionTitle | null>;
  generateBranchName?(cwd: string, message: string): Promise<string | null>;
}
export const hostProviders: Record<RemoteProvider, HostProvider> = { codex: {...}, claude: {...}, ... };
```

- `host/engine.ts` `HostEngine` owns the sessions. `command(raw)` validates a `HostCommand` and calls `provider.send({... onEvent: (e) => this.event(id, runId, e)})`. `event()` runs the **same `applyHarnessEvent`** from `src/` on the host-side `Session`, bumps the revision and records events. Deltas, `tool.updated`, `agent.step` and `status` are batched every 120 ms; everything else flushes immediately.
- `host/store.ts` `HostStore` persists with Node's built-in `node:sqlite` (`DatabaseSync`) in `~/.monocode-host`.
- Other host modules: `workspace.ts` / `workspace-commands.ts` (files, git, search for the remote UI), `git-worktrees.ts`, `git-branches.ts`, `attachments.ts` (chunked upload, 20 MiB per file), `browse.ts`, `service.ts` (systemd, launchd or Task Scheduler install), `windows.ts` + `windows-acl.ps1`, `owner.ts` (single-instance lock), `provider-guard.mjs`.

### Wire protocol
- Transport: HTTP `POST /rpc` on `127.0.0.1:3774`, reached through an SSH `-L` tunnel that `remote_ssh.rs` sets up. Requests with an `Origin` header or any other route are rejected (403). Auth is `Authorization: Bearer <43-char token>`, checked again after the body is read in case the device was revoked meanwhile.
- The desktop never exposes the token to JS. The renderer calls `invoke("remote_request", {machineId, method, params})` (`features/connections/model/connections.ts`), and Rust adds the credential.
- Envelope: `{ version: HOST_PROTOCOL_VERSION /* 1 */, environmentId, method, params }`. `environmentId` must match the host's, except for `environment.describe`.
- Methods (`host/server.ts` switch): `environment.describe` (→ `HostDescriptor` with `providers` and capability strings), `projects.list|browse|open`, `models.list`, `sessions.list|update|delete|sync|syncChunk|get`, `events.read`, `commands.dispatch`, `attachments.upload|read`, `devices.revokeSelf`, `git.diff|branches|switch|createBranch|worktrees|worktreeCreate|index|fileDiff|action`, `files.read|list|index|search|searchContent|create|write`, `workspace.run`.
- Commands (`src/features/connections/model/protocol.ts`), all idempotent by `commandId` and returning a `CommandReceipt {commandId, sessionId, revision}`:

```ts
export type HostCommand =
  | { type: "create"; commandId; projectId; worktreeCwd?; autoWorktreeBranch?; harness: RemoteProvider; model; modelSettings?; runtimeMode }
  | { type: "configure"; commandId; sessionId; model; modelSettings; runtimeMode }
  | { type: "compact"; commandId; sessionId }
  | { type: "send"; commandId; sessionId; text; attachments?: RemoteAttachment[]; intent?: "default" | "plan" | "build"; draftBlockId?; planBlockId? }
  | { type: "draft"; commandId; sessionId; text; attachments? }
  | { type: "removeDraft"; commandId; sessionId; draftBlockId }
  | { type: "cancel"; commandId; sessionId; runId }
  | { type: "approve"; commandId; sessionId; runId; requestId; decision: "allow" | "deny" }
  | { type: "answer"; commandId; sessionId; runId; requestId; reply: UserQuestionReply };
```

- Sync: the client polls `sessions.sync {sessionId, revision}` and gets back `SessionSync`: `unchanged`, a full `snapshot`, or a `delta` (changed blocks plus the ordered `blockIds`). `applySessionSync(known, sync)` merges it and throws if the base revision does not match, in which case the client asks for a snapshot. Large syncs come back `chunked` and are read with `sessions.syncChunk`.
- Poll cadence (`connections/ui/RemoteSession.tsx`): 750 ms while running, 3 s when visible, 10 s when hidden, with exponential backoff on failure. There is no push channel.
- `HostSession = { session: Session; projectId; revision; runId?; status: "idle" | "running" | "interrupted"; … }`.
- Remote sessions are never saved to the local SQLite (`shouldPersistSession` excludes remote paths). Remote paths use the `remote://` prefix (`shared/lib/remotePaths.ts`).
- Tests: `npm run test:host` (it builds first). Uses `host/vitest.config.ts` and runs real git, node and PowerShell processes.

---

## 9. Testing

- Runner: Vitest 3. `vitest.config.ts` uses `environment: "node"` and `include: src/**/*.test.ts`. Host tests use a separate config.
- `npm run check` = vitest + `tsc --noEmit` + `cargo fmt --check` + `cargo clippy -D warnings` + `cargo test`, the same as CI.
- DOM tests opt in per file with a first-line comment `// @vitest-environment happy-dom` (136 files). They render with `createRoot` + `act` + `createElement`, with no testing-library:

```ts
// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
it("opens Inbox context actions from the keyboard without navigating", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(RailAction, { label: "Inbox", icon: Inbox, onClick, onOpenContextMenu })));
    act(() => container.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true })));
    expect(onOpenContextMenu).toHaveBeenCalled();
  } finally { act(() => root.unmount()); }
});
```

- Tauri mocks: `vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))` with `vi.hoisted` mock objects (about 79 files). `core/child.test.ts` also mocks `@tauri-apps/api/event` `listen` and captures handlers to fire fake `harness-stdout` / `harness-exit` payloads. It uses `vi.resetModules()` and re-imports `./child` per test because the module holds global state.

### Provider "Live" tests: the core/child mock pattern (`claude/claudeLive.test.ts`)

```ts
const sent: string[] = [];
const spawned: string[][] = [];
let onLine: ((line: string) => void) | undefined;
let onExit: ((code?: number | null) => void) | undefined;
const writeChild = vi.fn(async (_id: string, line: string) => { sent.push(line); });

vi.mock("../../core/child", () => ({
  resolveClaudeBinary: async () => ({ path: "/fake/claude" }),
  spawnChild: async (_id: string, _path: string, args: string[]) => { spawned.push(args); },
  killChild: async () => undefined,
  unwatchChild: () => undefined,
  watchChild: (_id, line, exit) => { onLine = line; onExit = exit; },
  writeChild,
}));
const { sendClaudeTurn, cancelClaudeTurn, __claudeTestReset, ... } = await import("./claude");

const parse = () => sent.map((l) => JSON.parse(l));          // what MonoCode wrote to stdin
const emit = (rec) => onLine!(JSON.stringify(rec));            // pretend the CLI printed a line
const waitFor = async (pred, label) => { /* poll 200×5ms */ };

async function startTurn(sessionId) {
  const events: HarnessEvent[] = [];
  const turn = sendClaudeTurn({ sessionId, cwd: "/repo", model: "claude:claude-sonnet-5",
    modelSettings: {}, runtimeMode: "supervised", text: "explore the codebase",
    attachments: [], onEvent: (e) => events.push(e) });
  await waitFor(() => parse().some((m) => m.request?.subtype === "initialize"), "initialize");
  emit({ type: "system", subtype: "init", session_id: "sess_1" });
  emit({ type: "control_response", response: { subtype: "success", request_id: "monocode_1" } });
  await waitFor(() => parse().some((m) => m.type === "user"), "user prompt");
  return { events, turn };
}
// test: emit stream_event/assistant/result records → await turn → assert events,
// or fold events through applyHarnessEvent(newSession(...), e) and assert blocks.
```

- Call the `__<id>TestReset()` seams (and `resetHarnessIdlePark()` in the registry) in `beforeEach`/`afterEach`. Module maps persist across tests otherwise.
- Binary resolver seams: `setClaudeBinaryResolver`, `setPiBinaryResolver`.
- `*Real.test.ts` / `*Soak.test.ts` run real CLIs only when an env var is set (e.g. `AGY_REAL=1` plus `AGY_BIN`). Otherwise they skip.
- Protocol tests are pure input → output on recorded JSON lines.
- Rust: `#[cfg(test)]` modules in each file, e.g. `SessionStore::open_in_memory()` in `session_store.rs`. Migration tests build old schemas by hand.

---

## 10. Gotchas

1. **There was no `CLAUDE.md` in this repo** when this file was written. This file is the only agent-context doc.
2. **`App.tsx` is 11.4k lines.** Almost every cross-feature flow (submit, stop, handoff, plan build, orchestration, inbox, automations, quick launch) is a `useCallback` inside `Workspace`. `submitSession` alone is several hundred lines (~5901–7050). Search by callback name.
3. **Two parallel provider interfaces.** Desktop uses `HarnessAdapter` + the registry. The host uses `HostProvider` in `host/providers.ts`. A new adapter capability must be wired in both. Host `stop` maps to `forget<X>Session`.
4. **`harness/index.ts` re-exports per-provider functions** (`sendClaudeTurn`, `stopCursorSession`, …) that nothing outside `integrations/harness` imports through the barrel. Use the registry functions.
5. **Provider lists are duplicated** across about 10 places: the `HarnessId` union, `HARNESSES`, `HARNESS_LABEL`, `HARNESS_TITLE` (`session.ts`), `REMOTE_PROVIDERS` (`protocol.ts`), `register.ts`, the `resolveHarnessBinary` command map (`child.ts`), the `models.ts` list, `TEXT_HARNESSES`, `host/providers.ts`, and the `harness_resolve_*` Rust commands. CONTRIBUTING.md says new providers are paused until patterns converge.
6. **`onAccepted` is only implemented by Codex and the Pi family (pi/omp).** For other providers the edited-resend path is only accepted after `sendTurn` resolves.
7. **`apply.ts` drops some events.** `session.started`, `session.ended` and base64 `image.generated` hit `default: return session`. Handle them in App's `routeTurnEvent` if needed.
8. **Approval and question events skip the rAF batching** (`applyApprovalEvent`) and apply synchronously, after first draining that session's queue so ordering holds. Other events can be up to one frame late (100 ms when hidden).
9. **Stale-turn guard.** Every async step in a turn must re-check `turnGen.current.get(sessionId) !== gen`. Forgetting this lets a cancelled turn write into a new one.
10. **Provider state is module-global** (`liveByThread`, `resumeByThread`, …) per JS realm. Each window is its own realm with its own maps, while Rust `HarnessHost` keys children only by `sessionId`. Moving a session between windows goes through `stage_window_transfer` / `take_window_transfer`. Do not open the same session in two windows by any other route.
11. **Claude respawns on settings change.** Any change to model, effort, fast, thinking, context, runtime mode, account or the global "hooks" setting changes `settingsKey`, so the next send kills and respawns the CLI with `--resume`. A cwd change starts a **new** Claude conversation (sessions are cwd-bound).
12. **The shared text child.** `claudeText.ts` uses one fixed child id `monocode-claude-text` (default model `claude-haiku-4-5`, overridable per prompt) for all titles, commit messages and BTW prompts across sessions. Prompts are serialized on a module-level `turns` promise chain, so a slow PR-text prompt delays title generation.
13. **Persistence relies on block identity.** `persistFingerprint` uses WeakMap tokens per `Block` object. Mutating a block in place means it never saves. Always copy (`{...block, ...}`).
14. **The whole transcript is one JSON blob** (`blocks_json`) rewritten on every upsert. Long chats mean big writes. Writes are queued per session (`enqueueSessionWrite`), and `flushSessionWrites()` must run before worktree removal.
15. **Migrations** are a hand-rolled `if current < N` ladder up to 18, plus some unconditional `ensure_session_column` calls after it (e.g. `inbox_ask`). Add `if current < 19`, and add a test that builds the previous schema.
16. **In-memory vs persisted fields** on `Session` are only documented in comments. `sanitizeSessionForPersist` is the source of truth.
17. **Idle parking.** A child is killed 5 minutes after its last turn. The first prompt after that pays a respawn and resume. That is expected, not a bug.
18. **Exits are matched by pid.** Do not call `killChild` and `spawnChild` with assumptions about exit ordering. `pendingExit` handles exit-before-spawn-resolves.
19. **`configureChildBackend` throws if the bridge has already started.** Host code must configure it first.
20. **`fs.rs` is 8.6k lines** mixing file ops, git, GitHub (`gh`) and PR checks. `harness.rs` is 3.9k lines.
21. **Platform gating.** The quick composer, the keybinding and autosave menu commands, and dock features are `#[cfg(target_os = "macos")]`. Their TS callers must tolerate the commands being missing on Linux and Windows. Antigravity is not supported on Windows.
22. **The `app` / `control` CLIs are the same binary** (`main.rs` argv[1]). They only work during an active turn, gated by `control_authorize_turn` / `control_turn_finished`.
23. **Remote is polled, not pushed.** UI latency is about 750 ms per update while running. Remote sessions are not in local SQLite or local search.
24. **The host descriptor keeps backward compatibility:** when the client does not send `supportedProviders`, the host only advertises codex and claude.
25. **`vendor/portable-pty`** is a vendored fork. Do not `cargo update` it as if it were upstream.
26. **Model ids** are namespaced (`"claude:claude-sonnet-5"`). Sending one raw to a CLI is a bug. Use `nativeModelId()` / `resolveClaudeApiModelId()`.

---

## 11. Key files (ranked)

1. `src/integrations/harness/core/types.ts`: `HarnessEvent` and the turn input types, the contract every provider emits.
2. `src/integrations/harness/core/registry.ts`: `HarnessAdapter`, per-session op queues, idle parking, the control gate.
3. `src/integrations/harness/core/apply.ts`: the pure reducer turning events into transcript blocks.
4. `src/features/sessions/model/session.ts`: `Session`, `Block`, `HarnessId`, `RuntimeMode`, constructors.
5. `src/app/App.tsx`: all workspace state and every cross-feature flow, including `submitSession` and the event flush.
6. `src/integrations/harness/core/child.ts`: process I/O abstraction (`ChildBackend`), Tauri event bridge, binary resolution.
7. `src-tauri/src/harness.rs`: Rust child supervision, stdout events, account env, HTTP/SSE proxy.
8. `src/integrations/harness/providers/claude/claude.ts`: reference live adapter, the most complete state machine.
9. `src/integrations/harness/providers/claude/claudeProtocol.ts`: reference pure protocol translator.
10. `src/features/sessions/data/sessionStore.ts`: persistence whitelist, fingerprinting, write queue, restore backfills.
11. `src-tauri/src/session_store.rs`: SQLite schema, migrations, search, in-flight and workspace snapshots.
12. `src-tauri/src/lib.rs`: module list, managed state, setup, the complete command registry.
13. `src/features/sessions/ui/Composer.tsx`: input box, slash/mention pickers, intents, attachments (2.8k lines).
14. `src/features/sessions/ui/AgentTranscript.tsx`: transcript rendering of blocks (3.9k lines).
15. `src/features/sessions/model/models.ts`: model catalog store, `resolveModel`, `nativeModelId`, defaults.
16. `src/features/workspace/model/layout.ts`: tab and split-pane tree operations.
17. `src/features/connections/model/protocol.ts`: host wire types and `applySessionSync`.
18. `host/engine.ts`: host-side session engine reusing providers and `applyHarnessEvent`.
19. `src/features/orchestration/model/orchestration.ts`: `Orchestrator` lead/worker runtime (2.1k lines).
20. `src/integrations/harness/providers/claude/claudeLive.test.ts`: the canonical example of how to test an adapter with a mocked child.

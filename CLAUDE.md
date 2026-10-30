# Bonocode

A lean Tauri 2 desktop workbench that runs coding-agent CLIs (Claude Code, Codex, Cursor, …) in tabs. React 19 + TypeScript frontend in `src/` (Vite, Tailwind v4), Rust backend in `src-tauri/src/`. Tests are vitest (add `// @vitest-environment happy-dom` per file when DOM is needed) and `cargo test`.

## Working rules

- Never commit, push or stash.
- Never run cargo, vite, builds, dev servers, `npm run check` or `npm run check:web`, and never more than one test run at a time.
- Allowed checks, one at a time: `npx tsc --noEmit` and `npx vitest run --maxWorkers=2 <one file>`.
- If the code doesn't match what a plan expects, stop and report instead of improvising.

## Verify

- `npm run check` is what CI runs: `vitest run && tsc --noEmit`, then `cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test`. The working rules above restrict what you may run locally.
- Halves: `npm run check:web` and `npm run check:rust`.

## Layout

- `src/app/`: application composition, window shell, startup.
- `src/features/<feature>/{ui,model,hooks,data}`: files, github, notifications, projects, providers, search, sessions, settings, skills, source-control, terminal, workspace.
- `src/integrations/harness/core/`: provider-independent harness layer (registry, event reducer `apply.ts`, child-process bridge).
- `src/integrations/harness/providers/<id>/`: one adapter per provider: `<id>.ts` (live session), `<id>Adapter.ts`, `<id>Protocol.ts` (pure, unit tested), `<id>Live.test.ts` (mocks `../../core/child`).
- `src/platform/tauri/`: `invoke` wrappers. `src/shared/`: feature-free UI, hooks, utilities.
- `src-tauri/src/`: PTYs, fs/git/GitHub (`fs.rs`), SQLite sessions (`session_store.rs`), windows.

## Conventions

- State: module-level stores read through `useSyncExternalStore`. Exemplar: `src/features/sessions/model/liveSessions.ts`. See `docs/app-split-map.md`.
- Turn cancellation: every async step of a turn re-checks `turnGen.current.get(sessionId) !== gen` (`src/features/sessions/hooks/useTurnController.ts`).
- Persistence relies on block identity. Never mutate a `Block` in place; always copy.
- Tauri commands are registered in `src-tauri/src/lib.rs` `generate_handler![…]` and called with `invoke("name")`. Change both together.
- No PR should push a file past 1,000 lines (`docs/code-quality-review.md`).
- Comments explain *why*, in full sentences, sparingly.

## Don't

- Revive removed M1 features: arcade, notes, reminders, automations, quick composer, work-item providers, inbox feed, orchestration operator, remote host.
- Add new providers. They are paused until the adapters share patterns (`CONTRIBUTING.md`).
- `cargo update` `vendor/portable-pty`. It is a patched fork (`vendor/portable-pty/UPSTREAM.md`).

## Further reading

- `docs/code-quality-review.md`: refactor roadmap ("Suggested order").
- `docs/app-split-map.md`: App.tsx split and state tooling.
- `plans/README.md`: queued implementation plans.
- `PROJECT_CONTEXT.md`: historical and partly stale (written for MonoCode at the fork).

# Benchmark (macOS)

Measures a built app: time to first window, time until it goes idle, idle memory
(app + WebKit webview + child processes such as agent CLIs) and bundle size.

    npm run bench -- --app /Applications/Bonocode.app --runs 5

- Quit the app (and any `npm run tauri dev`) first. Close Safari and Mail too:
  their WebKit processes could be counted as the app's.
- Your real app data is moved to `~/.bonocode-bench-backup/<timestamp>` and restored
  at the end, even on Ctrl+C. If the script is force-killed, move it back by hand to
  `~/Library/Application Support/<bundle id>` (and Caches, WebKit, Saved Application State).
- One untimed warm-up launch runs first, so timed runs start with existing app data.
- `--fixture <dir>` copies a prepared Application Support folder in first
  (used for "memory with 3 chats" and the 500-message chat).
- Results are saved as JSON in `bench-results/` (gitignored). Compare medians.
- "Time to window" is when the window appears; "time to idle" is when CPU use
  stays under --quiet-cpu (default 10% of one core) for 2 s. "Idle CPU" is the
  average CPU use while memory is sampled; high values mean something keeps
  running (animations, polling).
- Plug in the laptop and keep other heavy apps closed for stable numbers.

## Fixture: 3 chats, one with 500 messages

    npm run bench:fixture
    npm run bench -- --app /Applications/Bonocode.app --fixture bench-fixtures/three-chats

Builds `bench-fixtures/three-chats/` (gitignored) with the app's own code: a 500-message
chat (text, file reads, diffs, test output) and two small chats, restored as three tabs
in `~/bonocode-bench-project`. It contains `bonocode.db` and a `monocode.db` copy, so the
same fixture works for MonoCode v0.6.0. Rebuild it after any session schema change.

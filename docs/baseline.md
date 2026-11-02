# Performance baseline

Baseline for the M4 performance pass: **Bonocode v0.6.1** (CI-built from GitHub Releases, ad-hoc signed), measured Nov 2, 2026 on the Mac mini (Apple Silicon) with `scripts/bench`.

MonoCode v0.6.0 was the planned baseline, but the saved builds were lost. 0.6.1 is the last release before the performance work, so it is the reference instead. Numbers from M0 (before `5997f09`) are not comparable.

## Results (median of 3 runs)

| Metric | Empty app | 3-chat fixture (one chat has 500 messages) |
|---|---|---|
| Time to window | 221 ms | 229 ms |
| Time to idle | 0.85 s | 3.0 s |
| Idle CPU | 0% | 2.3% |
| Idle memory | 308 MB (app 125 · webview 161 · children 22) | 489 MB (app 137 · webview 297 · children 55) |
| Bundle / binary | 30.5 MB / 29.4 MB | same |

- Fixture run 1 took 54 s to go idle and used 632 MB; runs 2 and 3 took 3.0 s and used 478–489 MB. Cause unknown; watch for it in the perf pass.
- Typing latency was not measured (release builds have no Web Inspector). It is measured with a dev build during the Composer split.

## Targets (perf pass)

| Metric | Target |
|---|---|
| Time to window | ≤ 155 ms empty, ≤ 160 ms fixture (baseline × 0.7) |
| Idle memory | ≤ 215 MB empty, ≤ 342 MB fixture (baseline × 0.7) |
| Typing in the 500-message chat | median < 16 ms |
| Idle CPU | no higher than baseline, glass theme vs `paneOpacity: 1` |

## Reproduce

    gh release download v0.6.1 -p '*.dmg' -D ~/Downloads
    npm run bench:fixture
    npm run bench -- --app <path>/Bonocode.app --runs 3
    npm run bench -- --app <path>/Bonocode.app --runs 3 --fixture bench-fixtures/three-chats

Raw results are in `bench-results/` (gitignored).

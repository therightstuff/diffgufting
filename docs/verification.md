# Implementation verification

## Verified on macOS Apple Silicon

On 2026-09-14, Node 25.9.0 and Electron 44.3.0 were used for these checks:

- 19 core/host tests passed: document undo and review, bounded history, filesystem comparison, guarded saves, Git layers, unrelated repositories, linked worktrees, unmerged stages, worker cancellation, watcher replacement, and host responsiveness.
- Five editor integration tests passed: editing and disjoint contention with a second external version arriving during review, three-way merge/save/undo/close protection, simultaneous Git gutter markers, a browser-only host adapter without an Electron preload, and long-document scroll/selection preservation across layouts. New review versions appear without replacing current inputs; stale decisions are rejected in the dialog.
- Three CLI tests passed: detached launch, wait behavior, and invalid-source failure without an orphaned desktop process.
- The packaged macOS launcher ran using its bundled runtime; the native app opened with the replacement branding. Its embedded ICNS matched the generated replacement asset.
- The browser-host test initially selected the wrong window during concurrent startup; it was corrected to wait for the main window before creating its isolated browser window, and passed on rerun.
- All JavaScript syntax checks and strict OpenSpec validation passed. The npm dependency audit reported zero known vulnerabilities. Editor diagnostics and SonarQube tools were unavailable; no claim is made about those analyzers.

These historical focused runs covered 28 automated cases. Screenshots are generated under ignored `test-results/`.

## Comparison workspace verification

On 2026-09-15, the comparison workspace change was exercised on macOS Apple Silicon with Node 25.9.0 and Electron 44.3.0:

- 39 core/host tests passed, covering fixed revision metadata and annotated tags, comparison identity and deduplication, concurrent source loading, recent descriptor retention, navigation mapping, and existing editing/Git/filesystem behavior.
- 13 desktop editor/workspace cases passed across the final suite and focused rerun. Coverage includes retained edits, final-view close cancellation, folder browsing, recent-menu persistence across restart, dirty unfinished-selection protection, moved ref labels, base-relative dirty circles, light/dark changed-text styling, and centered cursor/scroll synchronization across four merge panes. Typing and merge-close assertions explicitly wait for rendered edit state before checking results.
- The packaged macOS launcher and CLI lifecycle checks passed. The embedded ICNS matches the supplied icon derivative; development startup now explicitly sets the Dock icon from the same icon master.
- The merge screenshot at `test-results/workspace-merge-navigation.png` was inspected. The native Dock screenshot attempt failed with `could not create image from rect`; visual confirmation of the Dock/application-switcher icon remains unavailable in this environment. Windows/Linux runtime appearance and macOS Intel runtime checks remain outstanding.
- Build, JavaScript syntax checks, whitespace checks, and strict OpenSpec validation passed. Editor diagnostic and SonarQube tools are unavailable; no analyzer result is claimed.

No dependency versions changed. Existing non-arm64 distributions predate this change and must be rebuilt before testing or distribution.

## Distribution artifacts

## Crash diagnostic check

`Electron-2026-09-15-201545.ips` records Electron 44.3.0 terminating with `EXC_BREAKPOINT` / `SIGTRAP` on the `CrBrowserMain` thread. Its recorded coalition and responsible process are Visual Studio Code, and the anonymized application path does not establish that the incident came from Diffgusting. It is therefore evidence of an Electron crash, not evidence that the reported folder-comparison failure has an identified cause.

An isolated 500-pair folder comparison ran through the shared wrapper on 2026-09-15 without a crash or timeout (run `42c1b625-8a07-4d66-8783-3e5b627fea2f`). This bounded run does not reproduce the original failure.

ZIP distributions were built for Windows x64, Linux x64, macOS arm64, and macOS x64. Packages are unsigned development builds. Windows embedded PNG icon resources, macOS bundle icons, and the Linux icon resource were checked against the replacement artwork. The Linux registration script passed shell syntax validation. PNG exports were visually inspected at 16, 32, 48, and 256 pixels.

Electron Packager warns that an optional macOS `.icon` asset is absent; the supplied ICNS is embedded and validated. This does not prevent the native macOS icon from being packaged.

## Performance observation

Before the comparison-engine source changes, revision `5624150` was extracted into an isolated temporary copy and measured against a 30-pair deterministic fixture on macOS arm64 / Node 25.9.0. Its initial comparison took 79.2 ms, the host heartbeat advanced 14 times, and host RSS changed from 54.8 MB to 85.8 MB. Worker memory, renderer memory, and I/O counters were unavailable and recorded as such; no crash or timeout occurred. The historical checkout used the current locked runtime only to make this retained source revision executable.

A fixture with 500 file pairs completed in about 3 seconds while packaging and desktop tests also ran. The host event-loop heartbeat continued during comparison. Ten journals configured for 1 KiB each retained 9,280 bytes in total after repeated edits. These are fixture measurements, not universal throughput guarantees. Cancellation and stale-result rejection passed independently.

On 2026-09-15, the wrapped baseline collector ran its deterministic 30-leaf fixture on macOS arm64 / Node 25.9.0. Initial comparison took 87.8 ms and the host heartbeat advanced 16 times; host RSS changed from 57.4 MB to 88.8 MB. The collector reported worker memory, renderer memory, and I/O counters as unavailable rather than zero, and recorded no crash or timeout. This is a baseline artifact for compatible local comparisons, not a universal acceptance budget.

A later wrapped run on the same machine family (run `24fd2732-d936-42e1-8e7c-a4aa8b06d9c7`) completed the compatible fixture in 72.6 ms, with 13 heartbeat ticks and host RSS changing from 62.5 MB to 88.2 MB. It likewise reported worker/renderer memory and I/O counters as unavailable and recorded no crash or timeout.

For this identified fixture and machine family, the recorded acceptance budgets are initial comparison ≤250 ms, at least one host heartbeat tick, and host RSS growth ≤128 MiB. They deliberately do not apply across different hardware, filesystem conditions, or fixture scales.

## Remaining platform checks

Native Windows and Linux runtime smoke checks are unavailable on this macOS host. macOS Intel packaging is complete, but native Intel runtime validation is also outstanding. Before release, run the editor and host suites on those target systems and verify the native launcher, detached/wait lifecycle, file watching, save/review flow, and operating-system icon appearance.

Use [testing](testing.md) for commands and [setup](setup.md) for packaging. Do not treat cross-platform artifact creation as native runtime validation.

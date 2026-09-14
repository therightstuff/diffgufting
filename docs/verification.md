# Implementation verification

## Verified on macOS Apple Silicon

On 2026-09-14, Node 25.9.0 and Electron 44.3.0 were used for these checks:

- 19 core/host tests passed: document undo and review, bounded history, filesystem comparison, guarded saves, Git layers, unrelated repositories, linked worktrees, unmerged stages, worker cancellation, watcher replacement, and host responsiveness.
- Five editor integration tests passed: editing and disjoint contention with a second external version arriving during review, three-way merge/save/undo/close protection, simultaneous Git gutter markers, a browser-only host adapter without an Electron preload, and long-document scroll/selection preservation across layouts. New review versions appear without replacing current inputs; stale decisions are rejected in the dialog.
- Three CLI tests passed: detached launch, wait behavior, and invalid-source failure without an orphaned desktop process.
- The packaged macOS launcher ran using its bundled runtime; the native app opened with the replacement branding. Its embedded ICNS matched the generated replacement asset.
- The browser-host test initially selected the wrong window during concurrent startup; it was corrected to wait for the main window before creating its isolated browser window, and passed on rerun.
- All JavaScript syntax checks and strict OpenSpec validation passed. The npm dependency audit reported zero known vulnerabilities. Editor diagnostics and SonarQube tools were unavailable; no claim is made about those analyzers.

The current total is 28 passing automated cases across the focused runs. Screenshots are generated under ignored `test-results/`.

## Distribution artifacts

ZIP distributions were built for Windows x64, Linux x64, macOS arm64, and macOS x64. Packages are unsigned development builds. Windows embedded PNG icon resources, macOS bundle icons, and the Linux icon resource were checked against the replacement artwork. The Linux registration script passed shell syntax validation. PNG exports were visually inspected at 16, 32, 48, and 256 pixels.

Electron Packager warns that an optional macOS `.icon` asset is absent; the supplied ICNS is embedded and validated. This does not prevent the native macOS icon from being packaged.

## Performance observation

A fixture with 500 file pairs completed in about 3 seconds while packaging and desktop tests also ran. The host event-loop heartbeat continued during comparison. Ten journals configured for 1 KiB each retained 9,280 bytes in total after repeated edits. These are fixture measurements, not universal throughput guarantees. Cancellation and stale-result rejection passed independently.

## Remaining platform checks

Native Windows and Linux runtime smoke checks are unavailable on this macOS host. macOS Intel packaging is complete, but native Intel runtime validation is also outstanding. Before release, run the editor and host suites on those target systems and verify the native launcher, detached/wait lifecycle, file watching, save/review flow, and operating-system icon appearance. OpenSpec task 7.2 remains unchecked for this reason.

Use [testing](testing.md) for commands and [setup](setup.md) for packaging. Do not treat cross-platform artifact creation as native runtime validation.

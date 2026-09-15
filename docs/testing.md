# Testing

Development uses Node.js's built-in test runner. `npm test` runs `tests/*.test.mjs`; a passing run exits zero and reports no failures. Tests own disposable filesystem/repository fixtures and clean up only their fixtures.

`npm run test:desktop` runs Playwright/Electron integration tests in `tests/desktop/`. Those tests require the built renderer, installed Electron runtime, and a graphical desktop. The packaged-app test additionally requires `npm run package -- darwin arm64` on macOS Apple Silicon. CLI process-lifecycle tests currently use macOS process inspection and explicitly skip other operating systems. Tests launch and close only their own application instance. Platform results distinguish completed checks from unavailable platforms.

Current focused suites cover document transitions and review, CLI/source parsing, filesystem comparison and guarded saving, monotonic source-load progress, Git layer snapshots and immutable absent paths, atomic-replacement watching, and Device theme state. The desktop suite covers editing, disjoint contention review, layout switching, undo, theme selection, and commit-picker ref labels, and writes a screenshot under ignored `test-results/`. Run `npm run build` before desktop tests. Teardown exits the owned test application directly so disposable unsaved buffers do not block cleanup.

Additional desktop cases cover three-way merge results, close cancellation, Git category gutters, the browser host boundary, long-document scrolling/selection, and the packaged macOS application. [Verification results and remaining platform checks](verification.md) record the completed runs. Set `DIFFGUSTING_SETTINGS_DIR` to an isolated directory when a test needs independent preferences.

`scripts/export-icons.mjs` exports PNG sizes plus ICO/ICNS containers using Sharp. `scripts/build-app.mjs` bundles the renderer with esbuild. `scripts/package-app.mjs` uses Electron Packager and the host's `zip` executable to assemble a distribution. Their npm commands are documented in [setup](setup.md). Successful scripts exit zero and print the paths or sizes they produced.

# Application identity investigation

## Attempt 1 — trace macOS identity source

**Hypothesis:** The current startup call updates the operating system's application identity.

**Action:** Inspected `src/desktop/main.mjs` and Electron's local type documentation for `app.setName` and packaging identity.

**Result:** `app.setName('diffgusting')` runs only after `app.whenReady()`. Electron documents that `setName` changes its internal name but not the name used by the operating system. Electron Packager instead derives the application bundle name from `productName` or `name` in `package.json`.

**Next step:** Determine whether the user is observing an unpackaged development Electron runtime, whose macOS bundle is inherently named Electron, or a packaged application with stale bundle metadata.

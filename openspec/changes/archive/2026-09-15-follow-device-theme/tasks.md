# Device theme tasks

## 1. Appearance preference and host

- [x] 1.1 Support and validate dark/light/system theme modes while preserving existing stored preferences and the Dark default.
- [x] 1.2 Resolve native appearance before window display and expose selected mode and resolved appearance through bootstrap and preference responses.
- [x] 1.3 Subscribe to OS appearance updates through the desktop host, publish current resolved state, and clean up listeners on shutdown.

## 2. Renderer and verification

- [x] 2.1 Add Device to the selector and apply concrete light/dark tokens from host state without remounting editors or replacing document state.
- [x] 2.2 Verify Device persistence, startup appearance, live OS changes, explicit overrides, rapid switching, and existing preference compatibility.
- [x] 2.3 Verify theme changes preserve buffers, cursor, viewport, history, layout, and contention markers; smoke-check native appearance integration on available supported platforms and report unavailable platform coverage.
- [x] 2.4 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.

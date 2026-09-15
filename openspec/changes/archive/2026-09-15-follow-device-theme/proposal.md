# Follow device theme

## Why

The theme selector currently offers only fixed Light and Dark choices. Users should be able to follow their device appearance automatically.

## What Changes

- Add a Device theme option that follows the operating system's light/dark appearance, including changes while the app is open.
- Persist the selected mode separately from its resolved light/dark appearance.
- Preserve existing explicit preferences and the current default for users who have not selected Device.
- Apply resolved appearance consistently without changing document or layout state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `themes-and-layouts`: Persisted device-following theme selection and live appearance updates.

## Impact

Uses the installed Electron native theme API through the existing host boundary, with changes to settings, bootstrap/events, and the renderer theme selector. No new dependency or operating-system setting mutation is required. This change is independent of source selection and undo batching.

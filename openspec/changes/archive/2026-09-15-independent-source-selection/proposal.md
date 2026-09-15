# Independent source selection

## Why

Browsing currently fills paths but does not load either source until both are submitted. Users need immediate feedback for each selection and a discoverable way to select historical Git contents.

## What Changes

- Load and display either side independently; compare automatically when both sources are ready.
- Show a per-side estimated progress ring from 0° to 360°, using information collected during loading.
- Add a link/unlink button between source selectors, linked by default, to synchronize browse starting locations.
- Detect the repository owning the selected path and offer a yes/no choice to select a commit.
- Provide an infinitely scrolling, paginated commit graph with branch/ref labels, description, timestamp, author, and hash.
- Preserve selected path scope, immutable snapshots, unsaved buffers, and protection against obsolete asynchronous results.

## Capabilities

### New Capabilities

- `git-commit-selection`: Repository discovery for a selected path and paginated graphical revision selection.

### Modified Capabilities

- `desktop-comparison`: Independent source loading, estimated progress, automatic comparison, and linked browse locations.

## Impact

Changes the source lifecycle in `src/host/session.mjs`, filesystem/Git loading and workers, the Electron host/preload contract, and renderer selectors and panes. Existing CLI source descriptors remain supported. Git observation remains read-only. No new dependency is assumed.

Loading, linked browsing, and commit selection belong together because they share selection identity, cancellation, path scope, and source replacement. Undo batching and device theme are separate changes with no implementation dependency on this one.

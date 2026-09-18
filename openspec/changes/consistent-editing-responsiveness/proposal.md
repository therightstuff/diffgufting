# Consistent editing responsiveness

## Why

The user reports a repeatable typing delay in a side-by-side comparison of `/Users/adamfisher/dev/cards-base/docs/spec.md`, commit `1fa8cefe08f7` versus the working tree. Existing incremental paths still contain full diff work; the cause requires a measured reproduction.

## What Changes

- Capture a baseline of the reported comparison without modifying its original files.
- Identify and fix measured renderer work causing editing stalls, including redundant full diffs and Git layer rendering if implicated.
- Extend versioned result sharing to editor decorations, layers, change lists, overview, and navigation.
- Add repeatable typing and comparison-switch regression coverage with correctness and responsiveness acceptance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `incremental-comparison`: Avoid redundant full comparisons in edit and navigation consumers while retaining correctness fallbacks.
- `comparison-performance`: Measure keystroke-to-paint latency and repeated switching for the reported scenario and portable fixtures.

## Impact

Potentially affects `src/core/incremental-diff.mjs`, `src/core/change-layers.mjs`, renderer synchronization, CodeMirror integration, and performance/desktop tests. Fix scope follows profiling evidence. Independent of the comparison creation proposal; no dependency changes are assumed.

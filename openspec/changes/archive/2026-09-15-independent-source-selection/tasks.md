# Independent source selection tasks

## 1. Source lifecycle

- [x] 1.1 Add per-side descriptors, generations, status, and loaded trees to the host session, with single-source read/save authorization and observation.
- [x] 1.2 Separate cancellable source loading from comparison calculation; compute from loaded endpoints and reject obsolete source/pair results.
- [x] 1.3 Adapt existing CLI open and base/output merge requests to the new lifecycle without changing their public descriptors.
- [x] 1.4 Add host/preload source events and operations, preserving response errors and validating side/generation ownership.
- [x] 1.5 Replace required Compare submission with native-selection and committed-path loading; render lone files/folders and automatically compare compatible ready pairs.
- [x] 1.6 Preserve opposite-side buffers/history and final-view close protection during replacements; cover mismatch, cancellation, failure, and retry states.

## 2. Estimated progress and linked browsing

- [x] 2.1 Add cancellation-aware file read progress and folder/Git work estimates using existing metadata and traversal; avoid extra scans and duplicate reads.
- [x] 2.2 Emit monotonic progress with bounded intermediate notifications and explicit terminal states; render accessible per-side rings from 0° to successful 360°.
- [x] 2.3 Extend native browsing with default locations and implement the default-linked toggle, independent unlinked locations, relinking, and cancel behavior.

## 3. Repository discovery and commit history

- [x] 3.1 Add selected-path repository discovery with repository-relative scope, including worktrees and submodules, and no descendant repository scan.
- [x] 3.2 Add side-scoped Yes/No prompts alongside immediate filesystem loading, with safe dismissal, missing-Git, and stale-prompt behavior.
- [x] 3.3 Implement host history sessions with captured ref tips, parent/metadata records, bounded incremental pages, opaque cursors, backpressure, and resource cleanup.
- [x] 3.4 Build the virtualized scrolling graph with persistent page-boundary lanes, ref labels, description, timestamp, author, full-hash access, details, empty/end states, and retry.
- [x] 3.5 Load selected immutable commits at the original file/folder scope; preserve original source kind when a historical path is absent and cancel stale loads.

## 4. Verification and documentation

- [x] 4.1 Add host/model coverage for lone-source editing, both-side replacement races, unsaved protection, load errors, linked locations, and existing CLI/merge behavior.
- [x] 4.2 Verify progress with uneven directory and large-file fixtures: observable start/completion, no backward movement, bounded events, no duplicate counting work, and cleanup on failure/cancel.
- [x] 4.3 Add Git fixtures for outside parent folders, nested repositories, worktrees, submodules, unborn history, merge pagination, changing refs, absent paths, retry, and read-only selection.
- [x] 4.4 Exercise renderer flows for independent loads, prompts, commit graph scrolling and selection, cancellation, accessibility, and stale result rejection; run relevant existing checks.
- [x] 4.5 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.

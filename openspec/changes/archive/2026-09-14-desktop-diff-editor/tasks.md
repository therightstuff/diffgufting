# Desktop diff editor implementation tasks

## 1. Foundation and dependency decisions

- [x] 1.1 Record supported Windows, macOS, and Linux versions and packaging formats; evaluate editor and diff components against transaction control, accessibility, large documents, and dependency footprint. Decision and platform targets: docs/setup.md; documentation hygiene checked.
- [x] 1.2 Establish the Node/Electron host, isolated renderer, worker, and shared-contract modules with pinned dependencies and security audit results.
- [x] 1.3 Define source descriptors, document identities, version fingerprints, comparison results, and the portable host interface.
- [x] 1.4 Establish focused unit, host integration, and desktop smoke-test entry points using disposable files and repositories.

## 2. CLI and comparison sources

- [x] 2.1 Implement and document CLI syntax for two source descriptors, optional merge base/output, validation, independent launch, and wait behavior.
- [x] 2.2 Implement file and directory sources with relative-path matching, symlink boundaries, supported text decoding, and explicit binary/unreadable states.
- [x] 2.3 Implement read-only Git snapshot loading and revision resolution for same-repository and unrelated-repository comparisons without checkout or index writes.
- [x] 2.4 Implement cancellable text/tree comparison workers and generation-based rejection of stale results.
- [x] 2.5 Verify directory additions/removals, cross-repository revisions, paths containing spaces, missing Git, launch errors, terminal independence, and wait lifecycle.

## 3. Document editing and undo

- [x] 3.1 Implement shared document buffers, synchronized baselines, disk versions, save checkpoints, and dirty-state calculation across multiple views.
- [x] 3.2 Implement the bounded undo/redo transaction journal for every content mutation, with a configurable 100 MiB initial per-document budget, visible eviction boundaries, and oversized-transaction backpressure. Six document-state tests pass; journal ownership and testing docs are aligned.
- [x] 3.3 Integrate the selected editor through the journal, including typing, search/replace, selections, keyboard commands, and encoding/newline-preserving saves.
- [x] 3.4 Implement hunk and whole-file transfer into writable buffers with immutable Git sources.
- [x] 3.5 Implement base/left/right merge inputs, conflict navigation, explicit accept decisions, and an editable output document.
- [x] 3.6 Implement final-view closure prompts and session history disposal without clearing history on save or presentation changes.
- [x] 3.7 Verify undo after editing, transfer, merge resolution, save, and reload; exercise budget exhaustion, redo branching, shared views, and close cancellation.

## 4. External change observation and review

- [x] 4.1 Implement file/parent-directory watching, content fingerprints, event coalescing, focus/periodic reconciliation, and visible monitoring failures with recovery.
- [x] 4.2 Refresh directory results incrementally and reload clean documents through undoable transactions, including atomic replacement detection and verified self-save suppression.
- [x] 4.3 Implement mandatory dirty-document review using baseline, local, and disk versions; support accept disk, keep local, and manual merge without automatic disjoint merging.
- [x] 4.4 Preserve distinguishable successive observed versions during review, invalidate stale resolutions, and provide explicit deletion/recreate/save-as handling.
- [x] 4.5 Implement serialized saves, pre-write fingerprint validation, retained observed pre-save versions, platform-appropriate replacement, post-save checking, and actionable failures.
- [x] 4.6 Verify disjoint dirty edits still require review, repeated external edits remain reviewable, clean reload is undoable, deletion preserves buffers, missed events converge, and detected save races pause or reopen review.

## 5. Git categories

- [x] 5.1 Compute base-to-HEAD, HEAD-to-index, and index-to-disk transitions with explicit commit-pair mode, base selection, unborn HEAD, and untracked-file behavior.
- [x] 5.2 Map layer transitions into shared ranges and retained change-list entries, preserving overlapping, deleted, and canceled changes plus separately labeled unsaved buffer edits.
- [x] 5.3 Attach source-side repository provenance for cross-repository comparisons and expose intermediate versions on selection.
- [x] 5.4 Observe index, HEAD, and relevant references including linked worktrees; refresh categories without replacing editor buffers or clearing history.
- [x] 5.5 Expose unmerged index base/ours/theirs sources for file-result merging while keeping index and repository metadata unchanged.
- [x] 5.6 Verify simultaneous categories, canceled staged changes, unrelated repositories, external staging/commit updates, linked worktrees, untracked files, unborn HEAD, and unmerged entries.

## 6. Themes and layouts

- [x] 6.1 Define semantic theme tokens and persistent preferences; implement light/dark themes with labeled Git, contention, and unsaved states.
- [x] 6.2 Implement layout registration and shared navigation/selection contracts with side-by-side, unified, and merge renderers.
- [x] 6.3 Implement simultaneous category markers, intermediate-version inspection, and retained canceled/deleted change entries in each applicable layout.
- [x] 6.4 Verify layout/theme switches preserve buffers, undo, review state, selections, and logical viewport anchors; exercise keyboard access and non-color state identification.
- [x] 6.5 Verify renderer behavior with a test host in a browser environment without direct Electron or Node filesystem imports.
- [x] 6.6 Integrate the generated logo and icon masters from assets/branding into application branding; verify identity and silhouette visibility in light/dark themes and all layouts.

## 7. Distribution and acceptance

- [x] 7.1 Package the desktop app and CLI for the supported Windows, macOS, and Linux targets with actionable installation and startup diagnostics.
- [x] 7.6 Derive required platform icon containers and resolutions from assets/branding/diffgusting-icon.png, preserving pixel edges, transparency where supported, and proportions; inspect at 16, 32, 48, and 256 pixels and verify embedded Windows resources, both macOS bundle icons, and the Linux registration resource/script. Native Windows/Linux appearance remains part of 7.2.
- [ ] 7.2 Run platform smoke checks for CLI launch, terminal closure, wait behavior, editing/saving, merge, watching/atomic replacement, contention review, undo, and Git layer refresh; record evidence and any unavailable platform checks. macOS arm64 checks passed; native Windows, Linux, and macOS Intel runtime checks remain unavailable on this host. See docs/verification.md.
- [x] 7.3 Measure packaged size, large-directory responsiveness, cancellation, and multi-document history consumption; resolve failures against the documented behavior.
- [x] 7.4 Run the focused automated acceptance suite and dependency audit; confirm no Git mutation commands or persistent history were introduced.
- [x] 7.5 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change, including the generated human-face branding and asset ownership, CLI examples, Git prerequisites, themes/layouts, review behavior, undo limits, and save-race limitations.

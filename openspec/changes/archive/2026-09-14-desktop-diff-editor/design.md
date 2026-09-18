# Desktop diff editor design

## Context

The repository contains OpenSpec scaffolding and no application implementation. The user requires a desktop editor launched from the CLI, minimal third-party packages, replaceable themes and layouts, and possible browser delivery later. Open documents must track external changes without losing local edits. Undo is session-local and does not survive document closure or restart.

## Goals / Non-Goals

**Goals:** File and directory comparison, same- and cross-repository Git sources, full text editing and merging, simultaneous Git change categories, external-change review, and configurable undo on Windows, macOS, and Linux.

**Non-Goals:** Git mutations, a shipped browser mode, persisted document history, binary editing, and remote collaboration. Saving a working-tree file remains supported and naturally changes its unstaged diff.

## Decisions

### Desktop shell and dependencies

Use Node.js with Electron and a browser-compatible renderer. Electron bundles the runtime and rendering engine across the three desktop platforms; its size is the accepted trade-off for consistent rendering. Python with pywebview was considered but introduces platform webview and toolkit variation. Tauri adds a Rust toolchain outside the requested Node/Python direction. See [Electron introduction](https://www.electronjs.org/docs/latest) and [pywebview installation](https://pywebview.flowrl.com/guide/installation).

Use a maintained editor component behind a document adapter; choose it in a bounded implementation evaluation covering controlled transactions, selection, accessibility, large documents, and undo integration. Prefer native platform APIs and small modules over a general UI framework. Any diff dependency must justify correctness benefits. Pin and audit selected packages during implementation, not proposal creation.

### Boundaries and launch contract

A CLI launcher validates inputs and starts an independent desktop process. Default invocation returns after successful launch; `--wait` returns when its comparison window closes. Each invocation creates its own comparison session. Package the CLI with the desktop distribution; users need no separate Node installation. Git must be installed only for Git sources.

Use explicit source descriptors: filesystem path, or repository path plus revision/index/working-tree selector and optional relative path. Resolve revisions to immutable object IDs for a comparison. Accept two descriptors for comparison and an optional base and output destination for three-way merge. Final flag spelling is decided and documented during CLI implementation; paths must be passed as argument arrays without shell interpolation.

Keep filesystem/Git access in the host, comparison calculation in cancellable workers, and presentation in the renderer. Expose a narrow typed host contract with document reads, saves, subscriptions, and comparison requests. Disable renderer Node access, use context isolation, and display file contents as text. A later local browser backend can implement the same contract; unrestricted browser filesystem access is not assumed.

### Sources and comparison model

Normalize sources into trees and immutable content versions. Match directory entries by relative path; report added, removed, changed, equal, and unavailable entries. Cross-repository comparison requires no common ancestor. Do not follow directory symlinks recursively; show link targets as entries. Detect binary or unsupported text before editing and show a clear non-editable state without rewriting bytes. Preserve supported encoding and newline conventions when saving.

Each open document owns its buffer, last synchronized baseline, latest observed disk version, save checkpoint, undo journal, and contention state. Multiple views of the same canonical document share that state. Layouts never own the authoritative buffer. Use generation IDs to discard stale asynchronous comparisons.

### Git categories retain intermediate versions

Compute separate transitions: selected base commit to HEAD for committed changes, HEAD to index for staged changes, and index to working tree for unstaged changes. An explicit commit-to-commit comparison reports committed changes only. A live comparison uses a user-selected base, defaulting to HEAD; therefore its committed layer can be empty. An unborn HEAD uses an empty committed tree. Untracked files appear as labeled unstaged additions; ignored files are excluded by default in Git mode. Unmerged index entries expose their available base/ours/theirs versions for merging into a file without modifying the index.

In comparisons involving two repositories, retain each repository's independent layers and label the source side; never infer staged status from cross-repository content differences. Arbitrary cross-source differences without a valid Git transition remain labeled as comparison differences. Unsaved buffer edits receive a separate unsaved indicator: they are not yet on-disk Git unstaged changes.

Map transition ranges into a shared comparison model with multi-category markers. Deleted or canceled transitions retain anchored entries in the change list even when absent from the final text. Selecting an entry reveals its intermediate versions without hiding other categories. Do not force overlapping changes into one color. Recompute on relevant index, HEAD, reference, and working-tree changes, including linked worktrees. Git operations use read-only plumbing without checkout or index writes. This follows [Git's endpoint model](https://git-scm.com/docs/git-diff).

### Editing, merging, and undo

Provide editing, search/replace, hunk transfer, whole-file transfer, and three-way merge with an editable result. Git objects and index snapshots are immutable sources; results save to an explicit writable file. Three-way merge inputs can use an explicit base across unrelated repositories. Conflict decisions are document transactions, and accepting one does not save automatically.

All content mutations pass through one undo transaction service, including clean external reloads, accept-disk actions, merge resolution, and programmatic replacements. Editor-native history must integrate with this journal rather than create competing stacks. Undo changes memory only; saving preserves history. Undo after a reload makes the restored version dirty relative to the latest disk baseline. New edits after undo clear the redo branch conventionally, but never discard versions awaiting contention review.

Proposed default: 100 MiB of retained history per open document, configurable in persistent preferences. Account for undo and redo data and use deltas/checkpoints. Evict oldest entries with a visible history-boundary notice. Pending review snapshots are protected separately. If an incoming transaction cannot preserve its immediately prior state within the budget, pause it and offer increasing the budget or canceling; never silently perform an irreversible content transition. Closing the final view of a document clears its history after handling unsaved edits and pending review. No history is written to disk.

### External observation and review

Watch parent directories as well as files to detect atomic replacements, rename, and deletion. Coalesce duplicate notifications, verify contents using fingerprints, rescan on focus, and use periodic reconciliation as a fallback for missed events. Compare content versions, not timestamps alone. Ignore verified notifications from the app's own successful saves. Signal unavailable watching or reads and retry rather than claiming current state.

Clean documents reload through undoable transactions. Every external content change to a dirty document opens mandatory contention review, even if changes are disjoint. Retain baseline, buffer, and observed disk version; offer accept disk, keep buffer, or a manually editable three-way result. No automatic merge is allowed for dirty documents. Further observed versions remain identifiable and reviewable; a newer version makes an older resolution stale. Only observed versions can be retained: a watcher cannot reconstruct every intermediate write made between reads.

Serialize application saves per document and compare disk against the reviewed fingerprint immediately before writing. Save through a platform-appropriate temporary file and replacement, preserving metadata where supported. Deletions require explicit recreate/save-as decisions. A changed fingerprint reopens review. Arbitrary external writers do not honor application locks, so a fully atomic compare-and-swap guarantee is not portable: retain the version read before replacement in session history, perform post-save verification, and surface detected races. Do not promise recovery of an unobserved write in the final operating-system race window.

### Presentation extensions

Themes define semantic tokens for change operation, Git category, contention, unsaved state, typography, and contrast. Ship light and dark themes. Layout adapters consume shared documents, comparisons, selections, and commands; ship side-by-side, unified, and merge views. Preserve cursor/selection and a logical viewport anchor across compatible layouts. Every layout exposes contention and multi-category state with labels as well as colors. A registration contract supports future built-in layouts without redesigning the engine; arbitrary third-party plugin execution is out of scope.

### Project logo and application icon

Branding assets are derived from the large and small human-face illustrations in `assets/branding/legally-human.jpeg` and stored at `assets/branding/diffgufting-logo.png` and `assets/branding/diffgufting-icon.png`. Both are square 1254-pixel PNG masters with alpha channels. The logo and icon retain the supplied human face, shaggy black hair, floppy ears, mismatched red and green eyes, tan beard, crooked teeth, and turquoise collar. The user supplied this replacement to supersede the original branding. Only the replacement assets are used in the application and distribution. Use these assets rather than independently regenerating platform artwork. Preserve pixel edges and proportions when deriving sizes; inspect small exports and use a neutral backing surface if required for dark-theme contrast. Produce platform icon containers and size variants during packaging, not by treating the master PNGs as finished ICO/ICNS bundles. Branding is independent of Git status colors and must not change identity with theme or layout.

## Risks / Trade-offs

- Electron footprint → Keep other runtime packages selective and report packaged size during platform validation.
- Git range mapping can lose canceled changes → Retain transition identities and test overlapping, deleted, and reverted edits independently of endpoint rendering.
- Watch events can be missed or duplicated → Fingerprint, rescan, reconcile periodically, and exercise atomic replacement and watcher recovery.
- Memory scales with document count → Configurable history budgets, delta storage, visible eviction, and backpressure that never silently discards unresolved review state.
- External writes can race saves → Revalidate and retain observed states; document the unavoidable race with uncooperative writers.
- Large scans can stall interaction → Cancellable workers, incremental tree updates, and stale-result rejection.

## Migration Plan

No existing application data needs migration. Implement contracts and state-machine tests first, then comparison and editor integration, then watchers and Git layers, then platform packaging. Release only after Windows, macOS, and Linux launch/edit/watch smoke checks. Removing the app removes its settings; user files and repositories remain ordinary files without migration. Rollback never restores user files automatically.

## Open Questions

No blocking product questions remain. Implementation must record the chosen editor/diff packages and their dependency rationale, supported OS versions and packaging formats, CLI flag syntax, and measured history budget behavior. The 100 MiB default is a proposed initial setting, not a user-mandated number.

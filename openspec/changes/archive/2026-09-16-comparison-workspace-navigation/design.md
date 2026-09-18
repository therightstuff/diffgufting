# Comparison workspace navigation design

## Context

The renderer in `src/ui/app.mjs` owns one active comparison and a map of document buffers. Open Documents renders buffers, pane titles use document labels, and navigation reveals a position in one editor. `src/desktop/main.mjs` owns one host session and a File menu without recent entries. Git history already returns commit IDs and ref decorations. Packaging derives icons from the correct master, but runtime OS identity needs explicit verification.

## Goals / Non-Goals

**Goals:** Implement all six workspace improvements while preserving independent loading, immutable Git snapshots, shared writable buffers, undo history, and external-change protection.

**Non-Goals:** Synchronization between different comparisons, Git checkout or ref mutation, persistent undo history, and a symbol-based code outline.

## Decisions

### Comparison records own source identity

Introduce an open-comparison registry with an active record. A record stores ordered left/right source descriptors, resolved base revisions, selected file, layout, preferred ref labels, and logical navigation state. Identity includes normalized absolute paths, repository and scoped path where relevant, source kind/live-state selector, and full resolved commit IDs. Include explicit merge base/output descriptors when supplied so distinct merge operations cannot collide. Branch/tag aliases resolving to one commit share identity; reversing sides remains a distinct ordered pair.

Keep an incomplete single-source selection as draft state until a compatible pair loads successfully. Activate an existing record on a duplicate open; browsing child files, editing, saving, or selecting a display alias never adds records. Revision changes create or activate a distinct record. Preserve old records and their buffers when switching.

Use host session routing by comparison ID, with asynchronous events scoped to that record and source generation. Keep writable document contents/history shared by canonical path across records; key snapshots by repository, scoped path, and commit ID. Closing a record releases its document references and prompts before closing the final dirty or contested view. This avoids both the current single-session replacement losing state and separate copies of writable buffers diverging.

### Recent comparisons persist descriptors

Persist a versioned list of at most 10 successful comparison identities alongside desktop settings, most recently activated first. Store source descriptors and fixed revisions, never buffers or undo stacks. File → Recent activates an already-open record or reopens its saved descriptors. Missing paths or objects produce an actionable error and retain the active comparison. Persisting a list of document visits was rejected because it recreates the confusing history list.

### Source headers separate identity, alias, and dirty state

Render the selected file's path and revision identity directly above each pane, including both identities in unified layout and explicit base/result identities in merge layout. Expose full paths and hashes through accessible details when width requires truncation. Prefer local branches, then tags, then remote branches, with deterministic sorting within each group. Clicking a label with multiple matching branch/tag names opens a display-only selector. Resolve annotated tags to their commits. Keep the captured commit immutable even if a ref moves later; do not silently relabel a moved ref as still identifying that commit.

For working-tree Git sources, capture HEAD as the base when selected; keep that base until the user selects another revision. Show Working tree explicitly. The circle means displayed contents differ from the fixed base, so saving alone does not clear it; returning to base contents does. Preserve a separate unsaved-to-disk indicator. A result uses its explicit merge base when available. Unborn repositories show Working tree without inventing a commit. Historical snapshots remain read-only.

### Explicit Git choice and application identity

Replace `window.confirm` with an accessible Yes/No dialog using the existing host boundary where native integration is needed. Explain that Yes opens the commit picker and No loads or keeps the current working version from disk. Dismissal follows No and stale prompts cannot replace a newer selection.

Use `assets/branding/diffgufting-icon.png` and its existing platform derivatives for runtime and packaged identity. Inspect launch behavior on each supported platform, including macOS development Dock identity, before deciding which runtime icon hook is needed. A correct window icon setting alone is insufficient evidence of correct OS identity.

### One navigation coordinator per active comparison

Register visible source, base, and result editors with a coordinator. Map cursor and vertical viewport positions through current diff chunks; map unchanged regions exactly and unmatched inserted/deleted regions to the nearest corresponding boundary. Clamp columns to target line length and horizontal offsets to each pane's scroll range. Preserve focus in the invoking pane. Annotate propagated selection changes and guard scroll propagation so synchronization cannot loop or create undo steps. Coalesce scroll work to animation frames and refresh mappings after edits.

Use the same mapping for next/previous change and a narrow overview on the right of the editor area. It represents the entire document extent with markers for the current comparison's changes and a current viewport/location indicator. Merge mode includes differences involving base, sources, and result using the shared mapped coordinate space. Clicking any position centers corresponding locations in every visible pane. With no changes, render an empty sidebar, including no location marker. Keep the existing detailed Changes panel for its actions. Raw equal-line or equal-pixel synchronization was rejected because inserted lines would misalign content.

### Stronger changed-text backgrounds

Override merge decorations using semantic light/dark tokens: line changes retain a softer fill, changed characters receive a stronger fill, and changed-text underlines are removed. Preserve readable foregrounds and distinct selection, search, and contention states in side-by-side and unified layouts.

## Risks / Trade-offs

- More retained comparisons increase memory and watcher ownership complexity → reference-count shared documents, release closed sessions, and retain existing history limits.
- Diff mappings change while typing → use current document versions and ignore stale mapping results; validate unequal lengths and deleted regions.
- A fixed base can differ from current HEAD or disk → show fixed hash details, Working tree state, and separate base-dirty and unsaved indicators.
- Icon caches can hide packaging errors → verify actual application surfaces for both development and packaged launches and record unavailable platform checks.

## Migration Plan

Existing settings without recent data start with an empty list. No existing undo state is persisted. Land registry/lifetime changes before wiring list/menu behavior, then headers, synchronized navigation, and visual changes. Existing disk formats and Git contents require no migration. Rollback removes the new UI behavior; extra recent metadata can be ignored without affecting file contents.

## Open Questions

No blocking product questions remain. Proposed defaults are persistent recent entries, ordered comparison pairs, deterministic local-branch/tag/remote-branch label precedence, and a base-dirty circle that remains after saving while content differs from the fixed commit.

# Independent source selection design

## Context

The renderer currently submits two paths to `open`; the host requires both, and a worker reads them sequentially before returning a complete comparison. The document registry and save authorization are attached to that comparison. Native browsing accepts only a file/folder flag. Git descriptors already support immutable revisions, but the UI has no repository discovery or history picker.

## Goals / Non-Goals

Goals: independent source display, automatic comparison, useful estimated progress, linked browse locations, and scoped commit selection. Preserve existing CLI comparisons, merge sessions, document history, and external-change review.

Non-goals: Git mutations, recursively discovering repositories inside a selected directory, composing multiple repositories at different revisions, exact progress measurement, raising existing file-size limits, or adding undo/theme behavior from the separate proposals.

## Decisions

### Own source state separately from comparison state

Give each side a descriptor, generation, load status, progress, and loaded tree. Source loading and comparison calculation become separate host operations; reuse the existing cancellable worker approach. Keep document authorization and observation available even with only one side loaded. The comparison worker consumes loaded source data rather than rereading both endpoints. CLI `open` remains an adapter into this lifecycle, including base/output support.

Start loading when a native choice succeeds or a manually entered path is committed with Enter or blur. Render a lone file as an editor and a lone folder as a browsable tree, without difference badges. Remove the required Compare submission. With two compatible, ready sources, calculate differences automatically; identify comparison calculation separately from source loading. Reject a file/folder mismatch with an actionable message while retaining both loaded sources.

A side generation scopes discovery, prompts, progress, errors, and results. Replacing a selection cancels its work and invalidates comparisons using it. Comparison results carry both source generations. Never render stale differences during a replacement. Preserve the opposite side and its documents. Before replacing the final view of a dirty or contested document, reuse save/discard/cancel protection; canceling keeps the current selection. This avoids the current whole-session reset, which would discard the other side's state.

### Estimate progress from the existing traversal

Begin every load with a visible zero state. For files, reuse stat size, count bytes from chunked reads, and reserve the final portion for decoding and publishing the usable result. For folders, maintain counts of discovered, completed, and pending work during the normal traversal. Estimate undiscovered work using observed directory fan-out and file sizes; use conservative initial weights until observations exist. Weight content reads by size and metadata visits by a small fixed cost. Git tree/blob loading uses listing and object-size information already needed to load content.

Map estimated work into 0–95%, clamp each reported value to at least the previous value, and set 100% only after the source is usable. If newly discovered work increases the estimate, the ring can hold steady until work catches up. Show the ring as estimated progress with a current phase and accessible value; throttle intermediate events to at most ten per second, always sending initial and terminal states. Paint 0° before applying buffered progress; briefly show 360° on success before removing the ring. Cancellation and errors never show successful completion. No pre-counting traversal, duplicate reads, or elapsed-time-only animation is used.

An exact denominator would require extra discovery work and is intentionally rejected. Estimates can plateau; phase and processed-count text explain ongoing activity. Unsupported entries count as processed when their explicit status is available, preserving existing size/encoding/link handling.

### Link browse locations, preserving independent choices

Place an accessible toggle between selectors, linked at session start. Store each side's last accepted browse location. A file uses its parent directory; a folder uses itself. While linked, either accepted selection updates both next-dialog starting locations. Unlinking keeps the current locations and allows them to diverge. Relinking uses the most recently accepted selection. Canceling a native dialog changes nothing. Linking does not alter the opposite source, revision, or loaded contents. Extend native chooser requests with a validated default path.

### Discover only the owning repository

Probe from the selected directory or a selected file's parent using Git's repository discovery, which supports worktrees and submodules whose `.git` is a file. Resolve repository root and the selected path relative to that root. Never scan descendants for repositories. A selected submodule root or path inside it belongs to that submodule; selecting its superproject preserves superproject scope and existing submodule-entry handling.

Begin filesystem loading immediately and perform repository discovery alongside it. Once discovery succeeds, offer “Pick a specific commit?” with Yes/No, once per accepted selection. No keeps filesystem contents. Yes opens the commit graph; committing a choice creates a new side generation and loads `{kind: 'git', repo, ref: fullHash, path}`. Canceling the graph retains the filesystem selection. Discovery failures or missing Git leave filesystem loading usable and explain why commit selection is unavailable. Empty history is a normal empty state.

### Browse history in bounded pages

Expose host operations to start, page, and close a history session tied to repository and source generation. Capture current local/remote branch tips, tags, and HEAD at session start; walk their reachable commits in topological order with newest-first preference. Return commit ID, parent IDs, author, author timestamp with timezone, subject, full message for details, and ref decorations. Ref labels identify tips; graph lines express ancestry without inventing a unique branch for every commit.

Use a host-owned incremental Git log stream with bounded buffering and backpressure, returning pages of 100 commits through opaque cursors. A virtualized graph keeps rendered rows bounded and preserves parent lane continuity between pages. Do not materialize all history before showing the first page or rerun an ever-growing skipped history query. End of history, page failures, retry, and cancellation have explicit states. Snapshot tips keep paging stable if refs change; reopening the picker refreshes them. Render repository text as text, and validate host arguments and cursor ownership.

Show repository-wide history so branch topology remains understandable; a chosen commit still loads only the originally selected path. If that path is absent, display an explicit absent-source state. When both sides are chosen, absence at that commit can participate as an addition/removal using the original file/folder kind; it must not accidentally expand to the repository root. Never check out or mutate the repository.

## Risks / Trade-offs

- Source/session refactoring can break save authorization or watchers → exercise single-side editing and replacement alongside existing CLI/merge workflows.
- Estimates can plateau on uneven trees → keep updates monotonic, expose processed work, and reserve completion for usable results.
- History graph paging can lose merge edges → retain parent lane state across page boundaries and test merges spanning pages.
- History processes or canceled readers can accumulate → close them on picker dismissal, replacement, and window shutdown; bound buffering and process idle lifetime.
- A prompt can arrive after selection changes → scope it to the side generation and serialize visible dialogs while preserving side identity.

## Migration Plan

Add host contracts and source-state support before replacing the source form flow. Preserve the existing CLI adapter and regression coverage throughout. No disk or repository migration is needed. Rolling back the application restores the previous selection UI without modifying source contents.

## Open Questions

None blocking. Estimate weights are implementation tuning values; acceptance depends on bounded overhead, monotonic display, and truthful completion rather than a specified error percentage.

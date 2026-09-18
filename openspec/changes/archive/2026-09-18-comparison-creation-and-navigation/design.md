# Comparison creation and navigation design

## Context

The renderer has a global source bar, a Folders checkbox, an outer scrolling sidebar, and a growing Show more file list. Workspaces register completed source pairs automatically. Revision selection already forks a draft, and exact comparison identities include fixed commits. See proposal.md for the intended workflow.

## Goals / Non-Goals

Goals: explicit creation, immutable file/folder type, visible open comparisons, group-local revision navigation, prompt-free Git selection, and bounded folder browsing.

Non-goals: global Back/Forward history, cross-restart restoration of open buffers, changing Git refs, or redesigning merge semantics.

## Decisions

### Separate creation drafts from registered comparisons

Represent a New page explicitly, with comparison type, independently loaded side descriptors, and an Open comparison action. Publish a sidebar entry on the first source selection and refresh its label as sources load. Loading and repository discovery remain immediate. Register the completed exact pair on submission or before a path/revision replacement, then open the replacement as a separate member of the same group. A lone source can be previewed within the draft. New starts an empty draft without closing any loaded workspace or prompting to discard its edits. Retain loaded drafts separately from registered exact comparison identities, expose each in the sidebar, and preserve their buffers and navigation state through New, Recent, and sidebar activation. Submission removes the retained draft entry before registering or deduplicating the pair. Empty drafts may be disposed during navigation. Changing draft type clears incompatible draft selections after existing dirty-document protection.

Keep explicit CLI and Recent requests on the direct-open path. Validate type at the host boundary, including manually entered paths and absent historical paths. Hide the type toggle in opened comparisons. A single global checkbox cannot enforce that invariant.

### Preserve exact identity and add a separate group identity

Keep exact resolved path/revision identities distinct from group identity. Seed independently opened groups from canonical source and merge scopes, but carry the invoking group explicitly through revision and compatible path replacements. A changed path must not derive a new group. Deduplicate replacements within their group; if an identical pair exists only in another group, retain separate comparison sessions with shared writable document ownership. New/CLI/Recent retain global exact-pair reuse.

Represent each group with its ordered unique members, a visit sequence, and a current visit index. Manual activation and revision selection append visits unless already current. Back/Forward moves the index without appending. Visiting a different comparison after Back truncates the forward visit sequence but keeps all open members. Switching groups preserves each group's index. Closing a comparison removes its visits only after protection succeeds; choose the nearest surviving prior visit, then the next available member, and show New if no comparisons survive. Remove an empty group.

Render one slot per group, using its cursor member even while New or another group is active. The slot closes only that represented member and has no history dropdown. Back/Forward arrows live in the top source panel and operate only on the active group's visit sequence; New and history boundaries disable the appropriate controls. Forward-visit truncation continues retaining members, which can be reactivated by selecting their source paths/revisions. New changes the displayed workspace, not group membership or its cursor.

### Reuse scoped revision selection with an explicit working option

Render an accessible combobox beside each source on New and beside each comparison root in an open comparison. Its popup retains the existing bounded history graph and exposes working version, branches, tags, and commit choices. Ref aliases resolving to the same commit activate the existing identity; label-only changes do not add history. Keep full commit IDs accessible and preserve fixed-base dirty indicators.

Opening the selector performs no mutation. In an incomplete draft, selection replaces that draft side. If both sides already form a completed pair, preserve that pair as a registered member before opening the selected revision in the same group. In an open comparison, selection builds or activates a separate comparison in its group. Keep the original active until the replacement loads successfully; cancellation, failures, and obsolete results retain it. Selecting working state must use the original filesystem scope. No Yes/No discovery dialog remains.

### Give each sidebar section its own viewport

Use a constrained sidebar column with a files region and a bottom comparison region occupying one third of available sidebar height when expanded. Its header remains visible when collapsed and files use the released space. New… is the first list entry. Keep groups and comparison close buttons accessible within the independent scroll area.

Use viewport windowing for folder tree/list rows and a bottom boundary trigger for additional visible ranges. Preserve scroll anchors, filtering, selection, and expansion across changes; prevent duplicate requests and stop at the end. An accumulating list triggered by scroll would still violate the existing mounted-row bound.

## Risks / Trade-offs

- Draft auto-registration is currently embedded in workspace events → separate draft completion from explicit submission and test source-generation races.
- Re-deriving a group from replacement paths would split one workflow → carry its group explicitly and test path/revision changes, independent groups, and exact-pair collisions.
- Closing history members could discard dirty documents → run existing final-reference protection before changing membership or history.
- Windowed tree rows can move during inventory updates → retain stable path anchors and selection independent of DOM rows.

## Migration Plan

Add host state and APIs, then integrate New, selectors, groups, and sidebar rendering. Retain existing Recent descriptors and direct CLI opening. Keep group visits in memory; no persisted buffer or history migration is needed. Rollback is a code rollback with existing recents still readable.

## Open Questions

None blocking proposal completion. Group membership normalization and history edge behavior above are implementation decisions to verify with tests.

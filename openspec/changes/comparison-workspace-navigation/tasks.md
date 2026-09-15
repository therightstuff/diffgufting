# Comparison workspace navigation tasks

## 1. Comparison identity and lifetime

- [x] 1.1 Add normalized ordered source-pair identity with fixed commit IDs, scoped paths, live selectors, and explicit merge base/output descriptors; cover duplicate aliases and different revision pairs.
- [x] 1.2 Add the open-comparison registry and comparison-scoped host session/event routing while preserving independent draft source loading and stale-generation protection.
- [x] 1.3 Preserve shared writable buffers/history and distinct immutable snapshots across comparison switches; reference-count document ownership and protect final dirty or contested closure.
- [x] 1.4 Replace Open Documents with Open Comparisons, activate existing identities without duplication, and restore selected file, layout, and navigation state on switching.
- [x] 1.5 Verify folder browsing and editing leave one pair entry, revision selection creates a separate entry, switching retains unsaved work, and canceling final closure preserves state.

## 2. Recent comparisons

- [x] 2.1 Persist a versioned, deduplicated most-recent-first list capped at 10 successful comparisons with descriptors and fixed revisions, excluding buffers and undo history.
- [x] 2.2 Add File → Recent labels and activation/reopening through the host boundary; preserve active work when a saved source is unavailable.
- [x] 2.3 Cover ordering, cap, repeat activation, restart persistence, fixed revisions after ref movement, and missing path/object handling.

## 3. Git prompt and source headers

- [x] 3.1 Replace the repository prompt with explicit Yes/No wording explaining the working version; preserve dismissal behavior, independent loading, and stale-prompt protection.
- [x] 3.2 Capture fixed base commits and matching ref metadata, including annotated tags and unborn repositories, without changing snapshot immutability.
- [x] 3.3 Show prominent file paths and source/revision identity in every layout; add a display-only branch/tag selector and accessible full paths/hashes.
- [x] 3.4 Add the base-relative dirty circle beside the revision name and keep unsaved-to-disk state separate; saving must preserve the fixed revision.
- [x] 3.5 Cover Yes/No/dismissal, multiple aliases, hash fallback, moved refs, file-header updates, saved-but-base-dirty contents, and restoration of base contents.

## 4. Synchronized navigation and overview

- [x] 4.1 Add content-position mapping for source/base/result panes, including unequal lengths, inserted/deleted regions, empty documents, and column clamping.
- [x] 4.2 Register active layout panes with a coordinator for cursor and both scroll axes; preserve focus, guard feedback loops, coalesce scrolling, and avoid creating undo entries.
- [x] 4.3 Add the right-side full-document change overview, current location indicator, accessible navigation, and click-to-center behavior using the shared mapping.
- [x] 4.4 Route previous/next change through coordinated navigation and update overview/mappings after edits and layout changes; render an empty overview when no changes remain.
- [x] 4.5 Verify bidirectional navigation in all active panes including merge result, centered overview jumps near boundaries, horizontal clamping, long documents, and independence of other comparisons.

## 5. Icon and changed-text styling

- [ ] 5.1 Inspect actual development and packaged OS icon surfaces, then wire the existing app-icon master/derivatives into any missing runtime or package integration. Runtime Dock wiring and packaged ICNS verification are complete; direct Dock/application-switcher visual confirmation remains blocked because native screen capture failed. See docs/verification.md.
- [x] 5.2 Add stronger semantic changed-character backgrounds and remove changed-text underlines for inserted and deleted text in light/dark side-by-side and unified views.
- [x] 5.3 Verify icon artwork on available supported platform surfaces and highlight readability with selection/search/contention; record any platform verification still outstanding.

## 6. Integration validation and documentation

- [x] 6.1 Run focused model and desktop checks for the changed workflows and the required repository build/quality checks; resolve failures affecting this change.
- [x] 6.2 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.

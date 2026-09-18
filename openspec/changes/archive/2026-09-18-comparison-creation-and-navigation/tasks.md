# Comparison creation and navigation tasks

## 1. Draft lifecycle and comparison type

- [x] 1.1 Add explicit creation-draft state and Open comparison submission, retaining independent loading without automatic registration.
- [x] 1.2 Add host-enforced file/folder type validation, including typed paths, absent historical sources, and protected draft type changes.
- [x] 1.3 Implement New startup and New… entry while preserving direct CLI and Recent opening and existing open buffers.
- [x] 1.4 Cover submission deduplication, source failures, stale generations, single-source previews, and last-reference dirty protection.
- [x] 1.5 Preserve loaded drafts through New, Recent, and sidebar activation without close prompts; verify edited folder pairs before and after explicit submission through both New entry points, plus restoration, undo, submission deduplication, and explicit closure.

## 2. Related groups and navigation

- [x] 2.1 Retain group identity through revision and compatible path replacements, with exact-pair deduplication within the invoking group and independent-group collision coverage.
- [x] 2.2 Implement per-group visit sequences, Back/Forward cursors, direct member activation, and forward-visit truncation without closing members.
- [x] 2.3 Integrate member closure with dirty-document protection, visit removal, active fallback, and empty-group cleanup.
- [x] 2.4 Test New retention, independent groups, path/revision replacement, repeated activation, shared writable state, and close cancellation.
- [x] 2.5 List initiated comparisons on first source selection, refresh their titles on source changes, and preserve completed unsubmitted pairs as group history before path/revision replacements; verify Back/Forward titles and restored edits in desktop tests.
- [x] 2.6 Add pending group members when related file or folder replacements start so Back is enabled during loading; remove pending members on failure or cancellation.

## 3. Creation page and inline revisions

- [x] 3.1 Build the File/Folder creation page with side selectors, linked browse locations, progress/errors, and explicit Open comparison action.
- [x] 3.2 Replace discovery alerts with accessible inline version comboboxes using the scoped history picker and a working-version option.
- [x] 3.3 Keep root path typing/Browse and version controls available in opened comparisons while preserving child pane identity, fixed-base indicators, and full IDs.
- [x] 3.4 Make open-comparison revision selection load or activate a separate grouped comparison; preserve original state on cancellation, failure, or obsolete results.
- [x] 3.5 Update desktop tests for prompt-free discovery, branch/tag/commit selection, return to working contents, and all supported layouts.

## 4. Sidebar and folder scrolling

- [x] 4.1 Render one slot per group without a history dropdown; put group-local Back/Forward arrows in the top source panel, retaining member close controls and the anchored collapsible sidebar.
- [x] 4.2 Replace Show more with scroll-driven, viewport-bounded tree/list windows over the current inventory, without additional range requests.
- [x] 4.3 Preserve scroll anchors and selected paths across inventory updates, filters, expansion, and comparison switching; prevent duplicate/stale range work.
- [x] 4.4 Test long file and comparison lists, collapsed and empty states, keyboard access, end-of-list behavior, and bounded mounted rows.

## 5. Integration and documentation

- [x] 5.1 Run affected host and desktop suites, including unsaved/review state, CLI/Recent compatibility, async ownership, and comparison close cleanup.
- [x] 5.2 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.

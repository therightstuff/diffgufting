# Progressive folder comparison

## ADDED Requirements

### Requirement: Inventory before content

The engine SHALL discover and retain relative file paths, directory structure, and entry types before reading file contents for a folder comparison. The same inventory SHALL supply counting, display, and comparison scheduling without a separate counting traversal. Directory links SHALL NOT be followed. Empty directories and unreadable subtrees SHALL remain visible.

#### Scenario: Discover a large folder pair

- **WHEN** two folders are selected
- **THEN** inventory batches become visible before content comparison starts, and completed discovery provides the number of unique relative non-directory paths across both sides
- **AND** matched paths count once, existing `.git` exclusion is preserved, and discovery performs no file-content reads

#### Scenario: Incomplete or conflicting structure

- **WHEN** a directory is unreadable, empty, or conflicts with a file on the opposite side
- **THEN** the UI identifies the condition without silently omitting it or claiming an exact count of inaccessible descendants

### Requirement: Progressive tree and list states

The application SHALL offer tree and list views of the same inventory. Unresolved nodes SHALL be grey and have an accessible pending label. Folder aggregate states SHALL remain pending until their descendants resolve. The renderer SHALL bound mounted rows to the viewport and configured overscan.

#### Scenario: Comparison resolves incrementally

- **WHEN** some entries have been verified and others remain queued
- **THEN** resolved statuses appear in batches while unresolved nodes remain grey, and switching tree/list views preserves selection and results

#### Scenario: Only one source is selected

- **WHEN** a lone folder inventory is available
- **THEN** it is browsable without classifying absent opposite selection as additions or removals

### Requirement: Bounded accurate content comparison

The engine SHALL bound concurrent filesystem operations, worker execution, queued messages, and cached text bytes through configured limits. It SHALL determine byte equality independently of text editability and compute detailed text hunks on demand. Matching size and timestamps alone SHALL NOT prove equality. Results SHALL identify the source generations and content versions they verify.

#### Scenario: Equal binary or oversized files

- **WHEN** two non-editable regular files have matching verified contents
- **THEN** they are classified equal without loading them as editable text or building text hunks

#### Scenario: Content changes during verification

- **WHEN** a file changes while it is being read
- **THEN** a result for mixed or obsolete content is not accepted as verified, and the entry is retried or explicitly remains unresolved

#### Scenario: Worker failure or cancellation

- **WHEN** a worker fails or the comparison is canceled while queues are populated
- **THEN** the app remains usable, reports the failure or cancellation, releases that work, and rejects late results

### Requirement: Cache ownership follows open comparisons

Each comparison SHALL own its inventory and cached verification/diff results. Switching to another comparison SHALL retain reusable cached state. Closing the owning comparison SHALL release its cache references and background resources after existing dirty-document protection succeeds. No comparison cache SHALL persist across application restarts. Evictable content SHALL have a byte budget independent of dirty-document ownership.

#### Scenario: Switch and close

- **WHEN** the user switches away from an unchanged comparison and returns
- **THEN** valid cached results are reused
- **WHEN** that comparison subsequently closes
- **THEN** its cache, queued work, workers, and watchers are released without discarding a dirty document still owned by another open comparison

### Requirement: Targeted filesystem invalidation

The engine SHALL invalidate affected files and directory inventories on changes, additions, deletions, renames, and atomic replacement. It SHALL reconcile missed or ambiguous watcher events, mark uncertain cached results pending, and avoid unconditional content rereads or pair recomputation for unaffected verified files. External changes SHALL retain the existing review requirement for dirty buffers.

#### Scenario: Single file changes

- **WHEN** a known file changes on either side of an otherwise unchanged comparison
- **THEN** only affected content and dependent results are invalidated, folder aggregates update, and unrelated files are not rediffed

#### Scenario: Missing event detail

- **WHEN** a watcher fails or supplies insufficient information to locate a change
- **THEN** reconciliation checks the uncertain scope, discovers new and missing entries, and verifies content where metadata cannot safely validate cached state

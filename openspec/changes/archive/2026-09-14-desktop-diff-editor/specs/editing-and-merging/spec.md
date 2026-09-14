# Editing and merging

## ADDED Requirements

### Requirement: Editable comparisons and merge results

The application SHALL support text editing, search and replace, hunk transfer, whole-file transfer, and three-way merging with an editable result. Writes SHALL target an explicit writable file; Git snapshots SHALL remain immutable. Supported encoding and newline conventions SHALL be preserved.

#### Scenario: Merge immutable sources

- **WHEN** the user supplies base, left, and right snapshots and resolves their differences
- **THEN** the app allows editing and saving a result file without changing any source snapshot or Git index

#### Scenario: Transfer a hunk

- **WHEN** the user accepts a source hunk into a writable destination
- **THEN** only the selected change is applied to its buffer and remains unsaved until save is requested

### Requirement: Undo every document transition

Every document content transition SHALL retain an undoable prior state within configurable session history, including manual edits, transfers, reloads, replacements, and merge resolutions. Save SHALL preserve history. Undo SHALL modify the buffer rather than write to disk. Closing the final document view or exiting SHALL discard history; history SHALL NOT persist across restarts.

#### Scenario: Undo automatic reload

- **WHEN** a clean file reloads external contents and the user invokes undo
- **THEN** its previous contents return as a dirty buffer while disk retains the external contents

#### Scenario: Undo after save and merge

- **WHEN** a user resolves a merge, saves, and invokes undo
- **THEN** the pre-resolution buffer returns and disk remains at the saved version until another explicit save

### Requirement: Configurable bounded history

History capacity SHALL be configurable per open document with an initial default of 100 MiB. Eviction SHALL remove oldest history first and visibly mark the remaining boundary. Unresolved review versions SHALL NOT be silently evicted. A content transition that cannot retain its immediately prior state SHALL pause for a budget increase or cancellation.

#### Scenario: History budget exhausted

- **WHEN** another transaction exceeds the configured history capacity
- **THEN** the app evicts eligible oldest entries with notice or pauses if retaining the immediate prior state is impossible

### Requirement: Shared document lifetime and close protection

Views of the same document SHALL share contents and history. Closing the final view SHALL prompt for unsaved changes or pending contention and allow canceling closure.

#### Scenario: Close a dirty file

- **WHEN** the user closes the final view of a dirty document
- **THEN** the app offers save, discard, or cancel and keeps the document open if save requires unresolved contention review

# Editing and merging

## Purpose

Define editable comparison workflows and the lifetime of in-memory document history.

## Requirements

### Requirement: Editable comparisons and merge results

The application SHALL support text editing, search and replace, hunk transfer, whole-file transfer, and three-way merging with an editable result. Writes SHALL target an explicit writable file; Git snapshots SHALL remain immutable. Supported encoding and newline conventions SHALL be preserved.

#### Scenario: Merge immutable sources

- **WHEN** the user supplies base, left, and right snapshots and resolves their differences
- **THEN** the app allows editing and saving a result file without changing any source snapshot or Git index

#### Scenario: Transfer a hunk

- **WHEN** the user accepts a source hunk into a writable destination
- **THEN** only the selected change is applied to its buffer and remains unsaved until save is requested

### Requirement: Undo every document transition

Every document content transition SHALL participate in undoable shared document history within configurable session capacity, including manual edits, transfers, reloads, replacements, and merge resolutions. Consecutive edits SHALL be grouped according to the typing and action rules below. Save SHALL close the active group and preserve history. Undo SHALL modify the buffer rather than write to disk. Closing the final document view or exiting SHALL discard history; history SHALL NOT persist across restarts.

#### Scenario: Undo automatic reload

- **WHEN** a clean file reloads external contents and the user invokes undo
- **THEN** its previous contents return as a dirty buffer while disk retains the external contents

#### Scenario: Undo after save and merge

- **WHEN** a user resolves a merge, saves, and invokes undo
- **THEN** the pre-resolution buffer returns and disk remains at the saved version until another explicit save

### Requirement: Configurable bounded history

History capacity SHALL be configurable per open document with an initial default of 100 MiB. Eviction SHALL remove oldest complete undo groups first and visibly mark the remaining boundary. Unresolved review versions SHALL NOT be silently evicted. The latest accepted action or group SHALL retain the state preceding that undo unit. A content action that cannot retain that state SHALL pause for a budget increase or cancellation without changing the buffer. If extending a group would exceed capacity but the next edit fits independently, the application SHALL close the group and apply that edit as a separate undo unit under the same eviction rules.

#### Scenario: History budget exhausted

- **WHEN** another transaction exceeds the configured history capacity
- **THEN** the app evicts eligible oldest entries with notice or pauses if retaining the immediate prior state is impossible

### Requirement: Typing and deletion groups

Consecutive adjacent typing, backward deletion, and forward deletion SHALL form separate shared undo groups until at least 5000 milliseconds pass or an action boundary occurs. Input-method composition SHALL remain atomic.

#### Scenario: Typing pause

- **WHEN** typing resumes after five seconds
- **THEN** it starts a new undo group

### Requirement: Explicit action boundaries

Enter, cut, paste, selection replacement, replacement commands, transfers, merge resolutions, and external reloads SHALL be independent actions. Explicit navigation, focus transfer, save, undo, and redo SHALL close an active group; edit-induced movement and model synchronization SHALL NOT create history.

#### Scenario: Paste between typing

- **WHEN** a user pastes between typing sequences
- **THEN** the paste is one independent undo step

### Requirement: Undo and redo cursor placement

Undo and redo SHALL update text and primary selection together. The cursor SHALL collapse after inserted or restored text, or at the start of removed text. The invoking editor SHALL reveal that cursor without moving focus to another shared view.

#### Scenario: Undo inserted text

- **WHEN** undo removes typed text
- **THEN** the cursor is at the start of that text

### Requirement: Shared document lifetime and close protection

Views of the same document SHALL share contents and history. Closing the final view SHALL prompt for unsaved changes or pending contention and allow canceling closure.

#### Scenario: Close a dirty file

- **WHEN** the user closes the final view of a dirty document
- **THEN** the app offers save, discard, or cancel and keeps the document open if save requires unresolved contention review

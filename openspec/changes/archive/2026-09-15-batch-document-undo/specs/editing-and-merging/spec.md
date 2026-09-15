# Batched editing history

## MODIFIED Requirements

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
- **THEN** the app evicts eligible oldest groups with notice or pauses if retaining the immediate prior state for the new action is impossible

## ADDED Requirements

### Requirement: Typing and deletion groups

Consecutive adjacent typing SHALL form one undo group until at least 5000 milliseconds have elapsed since the previous edit or an action boundary occurs. Consecutive adjacent backspaces SHALL form a separate deletion group governed by the same pause, and SHALL NOT join typing. Forward deletions SHALL likewise use a distinct deletion group. Grouping SHALL belong to the shared document, remain within the existing history budget, and SHALL NOT divide an active input-method composition into partially undoable states.

#### Scenario: Type with short pauses

- **WHEN** the user types adjacent characters with less than five seconds between edits
- **THEN** one undo removes that typing group

#### Scenario: Type after five seconds

- **WHEN** the user types again at least five seconds after the previous edit
- **THEN** the new typing starts a separate undo group

#### Scenario: Backspace after typing

- **WHEN** the user types text and then presses backspace repeatedly with less than five seconds between adjacent deletions
- **THEN** the first undo restores the deleted text and the next undo reverses the preceding typing group

#### Scenario: Group reaches history capacity

- **WHEN** extending a typing group would exceed the per-document budget but the new edit can fit as a separate group
- **THEN** grouping ends at that boundary and existing oldest-first eviction rules apply with notice

### Requirement: Explicit action boundaries

Each Enter, cut, paste, selection replacement, replacement command, transfer, merge resolution, and external reload SHALL be an independent content action isolated from adjacent typing or deletion groups. Explicit cursor relocation, selection changes, focus transfer to another editor, save, undo, and redo SHALL close an active group. Movement caused by the current edit or model synchronization SHALL NOT itself close that group. Navigation alone SHALL NOT create a content undo entry.

#### Scenario: Enter between typed lines

- **WHEN** the user types a line, presses Enter, and types another line
- **THEN** successive undos remove the second typing group, undo Enter, and remove the first typing group

#### Scenario: Jump to another location

- **WHEN** the user types, clicks or navigates elsewhere, and types again within five seconds
- **THEN** the two typing sequences are separate undo groups and no extra undo step is created for the jump

#### Scenario: Paste between typing

- **WHEN** the user types, pastes through a keyboard shortcut or native menu, and continues typing
- **THEN** the paste is one independent undo step between the typing groups

### Requirement: Undo and redo cursor placement

Undo and redo SHALL update text and primary selection together. The cursor SHALL collapse after text inserted or restored by that operation, or at the beginning of removed text when the operation inserts nothing. Replacement SHALL use the end of inserted or restored text. For an action with disjoint ranges, the application SHALL use the range associated with the original primary selection, falling back to the last changed range in document order. The invoking editor SHALL reveal that cursor without moving focus to another shared view.

#### Scenario: Undo inserted text

- **WHEN** undo removes a typing group
- **THEN** the cursor is at the beginning of the removed text

#### Scenario: Undo deleted text

- **WHEN** undo restores a cut or backspace group
- **THEN** the cursor is immediately after the restored text

#### Scenario: Undo and redo replacement

- **WHEN** the user undoes a replacement and then redoes it
- **THEN** undo places the cursor after the restored original text and redo places it after the replacement text

#### Scenario: Undo across layouts

- **WHEN** the user changes layout and invokes undo in another view of the same document
- **THEN** the same grouped history is used and the invoking view reveals the resulting cursor position

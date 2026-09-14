# External change review

## ADDED Requirements

### Requirement: Watched sources converge to disk state

Open files and folders SHALL be watched for content changes, creation, deletion, rename, and atomic replacement. The application SHALL reconcile missed events and expose monitoring or read failures. Folder refresh SHALL preserve open buffers and history. Verified app-originated saves SHALL NOT trigger false contention.

#### Scenario: Atomic replacement of a clean file

- **WHEN** an external editor replaces a clean open file through a rename
- **THEN** the app detects the replacement, reloads it undoably, and keeps observing subsequent changes

#### Scenario: Folder changes during editing

- **WHEN** external activity adds or deletes entries in an open folder
- **THEN** the tree refreshes without discarding edits in open documents

### Requirement: Mandatory review of dirty-file changes

Every observed external content change to a dirty file SHALL require review, including disjoint changes. The app SHALL preserve the last synchronized baseline, local buffer, and observed disk state and highlight contention. It SHALL offer accept disk, keep local contents, or edit/merge states without automatically overwriting either side.

#### Scenario: Non-overlapping edits

- **WHEN** local and external changes affect different lines of a dirty file
- **THEN** review is required and no automatic merge changes the buffer

#### Scenario: New external version during review

- **WHEN** a second distinct disk version is observed during review
- **THEN** it is identified separately, the current review inputs remain available, and an older resolution cannot silently authorize overwriting the newer version

#### Scenario: Accept disk then undo

- **WHEN** the user accepts the external state and invokes undo
- **THEN** their previous local buffer is restored without changing disk

### Requirement: Save-time contention protection

The application SHALL revalidate disk state immediately before saving and reopen review on detected divergence. It SHALL retain the observed pre-save version in session history, check post-save state, and surface detected races. It SHALL NOT claim protection against unobserved writes by uncooperative external processes during an operating-system replacement race.

#### Scenario: Change after review before save

- **WHEN** disk differs from the reviewed version at save-time revalidation
- **THEN** the app pauses saving and requests review of the newly observed state

### Requirement: Explicit deletion resolution

External deletion SHALL preserve open buffer contents and present the missing disk state. Recreating a deleted path SHALL require an explicit user decision.

#### Scenario: Dirty file deleted externally

- **WHEN** another process deletes an open dirty file
- **THEN** the editor retains the buffer and offers review with explicit recreate, save-as, or discard choices

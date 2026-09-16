# Comparison workspaces

## Purpose

Define unique comparison workspaces, their retained document state, and persistent recent comparisons.

## Requirements

### Requirement: Unique open comparison identity

The application SHALL list open comparisons as unique ordered file/folder path-and-revision pairs. Identity SHALL include source kind, repository scope, and full resolved Git base commit IDs where applicable, plus explicit merge base/output sources when supplied. Display aliases, file browsing, edits, and undo history SHALL NOT create additional comparisons. A different revision pair SHALL create or activate a separate comparison. Base revisions SHALL remain fixed during edits and saves.

#### Scenario: Reopen a pair

- **WHEN** the user opens the same paths and revisions again, including through another branch/tag alias of the same commits
- **THEN** the existing comparison becomes active and appears exactly once

#### Scenario: Change a revision

- **WHEN** the user selects a different commit for one side of an existing pair
- **THEN** a separate matching comparison is created or activated and the original comparison remains available

#### Scenario: Browse and edit a folder comparison

- **WHEN** the user opens several child files and edits a writable file
- **THEN** the folder pair remains one comparison with unchanged base revisions

#### Scenario: Load an incomplete pair

- **WHEN** only one source is ready or the source kinds are incompatible
- **THEN** independent source browsing remains available without creating a completed comparison entry

### Requirement: Comparison lifetime preserves document state

Switching active comparisons SHALL preserve each open comparison's source identities, selected file, layout, buffers, navigation state, and undo/review state. Views of the same writable file SHALL share contents and history. Closing the final reference to a dirty or contested document SHALL retain existing save/discard/cancel protection. Asynchronous results SHALL affect only their owning comparison and current source generation.

#### Scenario: Switch away from unsaved work

- **WHEN** the user activates another comparison and returns
- **THEN** the original edits, undo history, selected file, and pending reviews remain available

#### Scenario: Close the final dirty reference

- **WHEN** closing a comparison would close the last view of an unsaved file and the user cancels
- **THEN** the comparison and its document state remain open

### Requirement: Ten recent comparisons

File → Recent SHALL offer at most the 10 most recently activated successful unique comparisons, newest first, with paths and revision identities sufficient to distinguish entries. Recents SHALL persist across restarts using source descriptors and fixed revisions, without persisting buffers or undo history. Reopening SHALL activate the existing open identity or load its saved sources. Unavailable sources SHALL produce a useful error without replacing active work.

#### Scenario: Activate and evict recent entries

- **WHEN** the user activates an existing recent comparison after opening more than 10 distinct comparisons
- **THEN** it moves to the front without duplication and the menu retains only the latest 10

#### Scenario: Restart and reopen

- **WHEN** the app restarts and the user chooses a recent comparison
- **THEN** its saved paths and fixed revisions load without restoring prior unsaved buffers or undo history

#### Scenario: Recent source unavailable

- **WHEN** a recent entry references a missing path or Git object
- **THEN** the app identifies the unavailable source and retains the current comparison

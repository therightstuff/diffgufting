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

### Requirement: Explicit creation and immutable comparison type

The application SHALL provide a New comparison page with File and Folder choices, independent left/right sources and relevant revision selectors, and an explicit Open comparison action. New… SHALL open an empty creation draft while preserving open comparisons and loaded unsubmitted work, without a save/discard/close prompt. Drafts SHALL appear in the sidebar immediately upon the first source selection, and their titles SHALL update as sources load. Loaded drafts SHALL remain selectable from the sidebar with their sources, selected files, unsaved buffers, and undo history intact. Recent and sidebar activation SHALL preserve loaded drafts in the same way. Explicit closure and destructive draft source/type changes SHALL retain dirty-document protection. Completing source loading SHALL retain the initiated sidebar entry. Explicit submission SHALL register or activate its exact identity only when sources are ready and compatible. Changing either path or revision of a completed pair before submission SHALL first preserve the pair, then create or activate a separate comparison in its group with navigable Back/Forward history. Each opened comparison SHALL retain its file/folder type for its lifetime; host validation SHALL reject incompatible replacements, including manually entered paths. Absent historical paths SHALL retain their declared type. Changing draft type SHALL clear incompatible selections with existing final-reference dirty-document protection.

#### Scenario: Prepare revisions before opening

- **WHEN** both paths finish loading on New and the user has not submitted
- **THEN** the initiated comparison remains active and visible in Open Comparisons, and changing its path or revision preserves the original pair in group history

#### Scenario: Submit an existing pair

- **WHEN** Open comparison is selected for an already open path and revision pair
- **THEN** that comparison is activated without a duplicate entry

#### Scenario: Attempt to change opened type

- **WHEN** a folder is supplied as a replacement in a file comparison or vice versa
- **THEN** the replacement is rejected and the original comparison remains intact

#### Scenario: Open New with unsaved comparisons

- **WHEN** the user selects New… while an open comparison has unsaved edits
- **THEN** an empty creation page appears and the existing comparison retains its buffers and history

#### Scenario: New preserves edited folders before submission

- **GIVEN** two folders are loaded and a child file has unsaved edits before Open comparison is selected
- **WHEN** the user selects New from the sidebar or File menu
- **THEN** an empty creation page appears without a close prompt, and the loaded folder pair remains selectable from the sidebar
- **AND** selecting that entry restores both folders, the selected file, unsaved edits, and undo history

#### Scenario: Navigate away from a loaded draft

- **GIVEN** a loaded draft contains unsaved edits
- **WHEN** the user activates a sidebar comparison or a Recent entry
- **THEN** the draft remains selectable with its edits intact and no close prompt appears
- **WHEN** the user explicitly closes that draft's last reference to the edited document
- **THEN** save, discard, and cancel protection applies

### Requirement: Related comparison groups and local visit history

An open comparison SHALL retain a stable group through changes to either Git revision or file/folder path. Replacements SHALL create or activate exact comparison members within the invoking group, even when repository or source locations change. Independently opened comparisons SHALL remain separate unless the existing exact-pair deduplication rules apply. Each group SHALL occupy one panel slot represented by its current member, including while another group or New is displayed. Back/Forward arrows in the top source panel SHALL navigate the active group's comparison windows. No grouped-comparison history dropdown SHALL be shown. Each group SHALL maintain independent Back/Forward history. Alias-only changes SHALL NOT add history entries.

Manual activation or revision selection after Back SHALL discard forward visits without closing their comparisons. Back/Forward SHALL move the history cursor without appending visits and SHALL be disabled at their respective boundaries. Switching groups SHALL preserve each group's cursor. Closing a member SHALL remove its visits only after dirty-document protection succeeds, selecting the nearest surviving prior visit, then the next available member. Empty groups SHALL be removed; closing the last comparison SHALL show New. History SHALL be session-local.

#### Scenario: Navigate revisions within a group

- **WHEN** the user opens revisions A, B, and C for the same pair and selects Back
- **THEN** B becomes active with its preserved state, and Forward returns to C

#### Scenario: Keep groups independent

- **WHEN** the user switches to another path-pair group and uses Back
- **THEN** only that group's visit history is traversed and the first group's cursor is preserved

#### Scenario: Branch from an earlier visit

- **WHEN** the user goes Back from C to B and selects revision D
- **THEN** D becomes the next visit, Forward is disabled, and C remains available as an open member

#### Scenario: Close or cancel closing a history member

- **WHEN** closing a member is canceled by dirty-document protection
- **THEN** membership and visit history remain unchanged
- **WHEN** closure succeeds
- **THEN** all visits to that member are removed and navigation targets only surviving comparisons

#### Scenario: Replace a file or folder path

- **WHEN** either source path of an open comparison is replaced by another compatible file or folder
- **THEN** the new member stays in the invoking group, updates that group's single panel slot, and Back restores the earlier member and its buffers

#### Scenario: Navigate a changed pair before explicit submission

- **GIVEN** two sources have finished loading without an explicit Open comparison action
- **WHEN** either path or Git revision changes
- **THEN** a separate member becomes active in the same group and Back is enabled
- **AND** the group's sidebar title identifies the new member
- **WHEN** Back is selected
- **THEN** the original member, its title, and unsaved buffers are restored, and Forward is enabled
- **WHEN** Forward is selected
- **THEN** the changed member and its title are restored

#### Scenario: Navigate while a related comparison loads

- **GIVEN** a completed file or folder comparison is active
- **WHEN** the user changes a compatible source path or revision
- **THEN** the related comparison immediately becomes the group's current member and Back is enabled before its sources finish loading
- **WHEN** the related comparison fails or is cancelled
- **THEN** its pending member is removed and the original comparison becomes active again

#### Scenario: List a comparison while its first source loads

- **WHEN** the first source is selected on New
- **THEN** the initiated comparison immediately appears as the active sidebar entry, including during source loading
- **AND** adding the second source updates the same entry's title

#### Scenario: Keep New separate from retained comparisons

- **WHEN** New is selected with a group open
- **THEN** the group's slot and current member remain retained without a close operation, and selecting that slot restores the member with its edits, selection, and history

#### Scenario: Replace with a pair present in another group

- **WHEN** a source replacement produces an exact pair already retained by another group
- **THEN** the invoking group retains its own member and history without moving or closing the other group's member; shared writable files continue sharing their buffers

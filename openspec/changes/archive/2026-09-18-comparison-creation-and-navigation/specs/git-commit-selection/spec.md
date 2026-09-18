# Inline revision selection changes

## REMOVED Requirements

### Requirement: Explicit working-version choice

**Reason**: The Yes/No discovery prompt is replaced by an inline selector.

**Migration**: Default to the working version and open revision selection only when the user activates its inline control.

## MODIFIED Requirements

### Requirement: Discover the selected path's repository

For an accepted filesystem selection, the host SHALL discover only the Git repository owning that file or folder and SHALL NOT search descendant folders for repositories. Discovery SHALL support linked worktrees and submodules. When a repository is found, the application SHALL expose an inline revision selector for that side without a discovery dialog. Filesystem loading SHALL begin independently; the working source SHALL remain selected until the user explicitly chooses another version.

#### Scenario: Select a tracked file inside a repository

- **WHEN** the user selects a file within a repository
- **THEN** the application exposes inline commit selection for that repository while retaining the file's relative path

#### Scenario: Select a folder containing repositories

- **WHEN** a selected folder is outside any repository but contains one or more repository directories
- **THEN** no revision selector is offered merely because of those descendants

#### Scenario: Select within a submodule

- **WHEN** the user selects a submodule root or a file or folder inside it
- **THEN** discovery uses the submodule's repository and preserves the selected path scope

#### Scenario: Select the superproject

- **WHEN** the selected folder belongs to a superproject containing submodules
- **THEN** the selector concerns the superproject and does not recursively request submodule revisions

#### Scenario: Git is unavailable

- **WHEN** repository discovery cannot run because Git is unavailable
- **THEN** filesystem loading remains usable and the application explains that commit selection is unavailable

### Requirement: Fixed base identity and selectable reference labels

Git sources SHALL retain a full resolved base commit identity for the comparison lifetime. Working-tree sources SHALL capture their base at selection and be labeled Working tree; repositories without commits SHALL display that state without a fabricated revision. Headers SHALL prefer matching branch/tag names over hash-only labels, with deterministic default precedence of local branches, tags, then remote branches. Clicking the revision label SHALL open the revision selector, which SHALL also expose multiple matching names for the current commit. Alias selection SHALL change only the displayed name, not contents, revision, or comparison identity. Full commit identity SHALL remain accessible. Ref movement SHALL NOT silently change the fixed base or imply that a moved name still points to it.

#### Scenario: Multiple names identify one commit

- **WHEN** branches or tags resolve to the displayed base commit, including annotated tags
- **THEN** a name is shown preferentially and opening its revision selector offers all matching names when more than one exists

#### Scenario: Display an unreferenced commit

- **WHEN** no branch or tag identifies the fixed commit
- **THEN** the header displays a commit hash with access to the full object ID

### Requirement: Scoped immutable commit sources

Selecting a commit SHALL load its full immutable object ID on the invoking side, retaining the selected file or folder's repository-relative scope. Canceling the picker SHALL retain the previously selected source, whether working or historical. Selected historical contents SHALL remain read-only, and picking commits SHALL NOT check out revisions or modify references, the index, or the working tree. Missing paths SHALL have an explicit absent-source state retaining their original kind and scope.

#### Scenario: Select different commits on each side

- **WHEN** the user picks commits independently for both sides
- **THEN** each draft side loads its selected snapshot and submission opens the comparison without changing either repository; choosing a different revision from an open comparison creates or activates a separate comparison

#### Scenario: Selected path did not exist

- **WHEN** the selected file or folder is absent at the chosen commit
- **THEN** that side reports the path's absence and comparison against a ready counterpart represents additions or removals without expanding scope to the repository root

#### Scenario: Cancel commit selection

- **WHEN** the user dismisses the graph without choosing a commit
- **THEN** the previously selected source remains and history-loading resources are released

#### Scenario: Replace selection while browsing history

- **WHEN** the source selection changes while its graph is pending
- **THEN** that picker cannot alter the new source and its background resources are closed

## ADDED Requirements

### Requirement: Inline working and historical version selection

Each Git-backed source SHALL expose a keyboard-accessible combobox next to its path on New and next to its file/folder root at the top of an open comparison. The displayed value SHALL identify the working version or chosen branch, tag, or commit. Opening the control SHALL offer the scoped history picker and an explicit working-version choice. Full resolved IDs SHALL remain accessible. Non-Git sources SHALL show their working identity without an unusable Git control.

Choices in an incomplete draft SHALL update only the invoking draft side. Once a draft contains a completed pair, selecting a different revision SHALL preserve that pair and create or activate a separate member of its group, even before explicit submission. An open comparison's choice SHALL create or activate a separate comparison in its related group without changing the original fixed identity, buffers, or history. Loading failure or cancellation SHALL preserve the original active comparison. Obsolete picker results SHALL NOT affect another comparison or replacement source.

#### Scenario: Choose history without an alert

- **WHEN** repository discovery completes for a selected source
- **THEN** its working-version combobox becomes available without a Yes/No dialog or automatic popup

#### Scenario: Return to working contents

- **WHEN** the user selects the working version from a historical source's combobox
- **THEN** the same filesystem scope is loaded, updating the draft or activating a separate grouped comparison as appropriate

#### Scenario: Select a branch or tag

- **WHEN** a branch or tag is chosen
- **THEN** its resolved commit is fixed for the comparison and its name is displayed while valid, with access to the full ID

#### Scenario: Failed revision replacement

- **WHEN** a revision selected from an open comparison fails to load
- **THEN** the original comparison remains active and usable and an actionable error is shown

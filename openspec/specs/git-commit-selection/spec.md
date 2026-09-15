# Git commit selection

## Purpose

Define selected-path repository discovery and read-only commit selection.

## Requirements

### Requirement: Discover the selected path's repository

For an accepted filesystem selection, the host SHALL discover only the Git repository owning that file or folder and SHALL NOT search descendant folders for repositories. Discovery SHALL support linked worktrees and submodules. When a repository is found, the application SHALL offer a yes/no dialog to pick a specific commit for that side. Filesystem loading SHALL begin without waiting for that choice. No SHALL keep the filesystem source; Yes SHALL open the commit picker.

#### Scenario: Select a tracked file inside a repository

- **WHEN** the user selects a file within a repository
- **THEN** the application offers commit selection for that repository while retaining the file's relative path

#### Scenario: Select a folder containing repositories

- **WHEN** a selected folder is outside any repository but contains one or more repository directories
- **THEN** no commit-selection prompt is offered merely because of those descendants

#### Scenario: Select within a submodule

- **WHEN** the user selects a submodule root or a file or folder inside it
- **THEN** discovery uses the submodule's repository and preserves the selected path scope

#### Scenario: Select the superproject

- **WHEN** the selected folder belongs to a superproject containing submodules
- **THEN** the prompt concerns the superproject and does not recursively request submodule revisions

#### Scenario: Git is unavailable

- **WHEN** repository discovery cannot run because Git is unavailable
- **THEN** filesystem loading remains usable and the application explains that commit selection is unavailable

### Requirement: Paginated commit graph

The commit picker SHALL display repository-wide history reachable from captured local and remote branch tips, tags, and HEAD, with graph edges expressing parent relationships. It SHALL show branch/ref decorations where applicable, commit description, author timestamp with timezone, author, and hash, with full hash and message accessible. Scrolling toward the end SHALL load additional bounded pages without loading all history before first display. Rendering and host read-ahead SHALL be bounded, and paging SHALL preserve graph continuity without duplicate or omitted commits within the captured history.

#### Scenario: Scroll across a merge

- **WHEN** scrolling loads a page containing parents of a merge on an earlier page
- **THEN** graph lanes connect consistently and each commit appears once with its metadata

#### Scenario: References change during browsing

- **WHEN** an external tool moves a branch while the picker is open
- **THEN** existing paging remains consistent with its captured tips and reopening the picker obtains refreshed history

#### Scenario: Empty history or end of history

- **WHEN** the repository has no commits or the user reaches the final page
- **THEN** the picker shows an explicit empty or end state and stops requesting nonexistent pages

#### Scenario: Page failure

- **WHEN** a page cannot be loaded
- **THEN** previously loaded rows remain visible with a useful error and a retry option that does not duplicate rows

### Requirement: Scoped immutable commit sources

Selecting a commit SHALL load its full immutable object ID on the invoking side, retaining the selected file or folder's repository-relative scope. Canceling the picker SHALL retain the filesystem selection. Selected historical contents SHALL remain read-only, and picking commits SHALL NOT check out revisions or modify references, the index, or the working tree. Missing paths SHALL have an explicit absent-source state retaining their original kind and scope.

#### Scenario: Select different commits on each side

- **WHEN** the user picks commits independently for both sides
- **THEN** each side loads its selected snapshot and the application automatically compares their contents without changing either repository

#### Scenario: Selected path did not exist

- **WHEN** the selected file or folder is absent at the chosen commit
- **THEN** that side reports the path's absence and comparison against a ready counterpart represents additions or removals without expanding scope to the repository root

#### Scenario: Cancel commit selection

- **WHEN** the user dismisses the graph without choosing a commit
- **THEN** the selected filesystem source remains and history-loading resources are released

#### Scenario: Replace selection while browsing history

- **WHEN** the source selection changes while its graph or repository prompt is pending
- **THEN** that picker or prompt cannot alter the new source and its background resources are closed

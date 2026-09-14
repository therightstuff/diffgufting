# Git change layers

## ADDED Requirements

### Requirement: Simultaneous category visibility

Live Git comparison SHALL represent base-to-HEAD committed changes, HEAD-to-index staged changes, and index-to-working-tree unstaged changes simultaneously using distinct theme colors and text labels. The selected base SHALL default to HEAD. Explicit commit pairs SHALL show committed differences only. Unsaved buffer edits SHALL be separately labeled.

#### Scenario: One region changed at every stage

- **WHEN** a region differs in the selected base, HEAD, index, and working tree
- **THEN** all applicable categories are visible together and selecting the region exposes its intermediate versions

#### Scenario: Staged change canceled on disk

- **WHEN** an unstaged edit reverses a staged edit so the final text matches HEAD
- **THEN** both changes remain discoverable in the shared change list despite the empty final endpoint diff

### Requirement: Independent repository provenance

Cross-repository comparisons SHALL retain each repository's own category context and identify its source side. Arbitrary endpoint differences SHALL NOT be misrepresented as staged or unstaged operations.

#### Scenario: Two dirty repositories

- **WHEN** both compared repositories contain staged and unstaged changes
- **THEN** the user can identify the repository and transition for every category marker

### Requirement: Read-only Git observation

The application SHALL refresh layers after external changes to HEAD, relevant references, index, or working-tree contents, including linked worktrees. It SHALL support untracked additions, unborn HEAD, and unmerged index sources with explicit labels. Git mutation commands SHALL NOT be included in this version.

#### Scenario: Another tool stages a file

- **WHEN** another tool updates the index
- **THEN** category markers refresh without changing an unsaved editor buffer or clearing its history

#### Scenario: Unborn repository and untracked file

- **WHEN** a repository has no HEAD commit and contains an untracked file
- **THEN** its committed baseline is empty and the file appears as an explicitly untracked unstaged addition

#### Scenario: Unmerged index

- **WHEN** the index contains unresolved merge entries
- **THEN** the available base, ours, and theirs versions can be inspected and merged into a file without marking the index resolved

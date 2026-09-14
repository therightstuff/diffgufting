# Desktop comparison

## Purpose

Define the launch lifecycle and supported sources for desktop comparisons.

## Requirements

### Requirement: Independent desktop launch

The application SHALL provide a packaged CLI and desktop window on Windows, macOS, and Linux. Default launch SHALL release the terminal after successful startup, and an explicit wait option SHALL wait for the comparison window to close. Invalid inputs and startup failures SHALL produce actionable diagnostics and a nonzero exit status.

#### Scenario: Terminal exits after launch

- **WHEN** a user launches a valid comparison and closes the terminal after startup succeeds
- **THEN** the comparison window remains usable in its independent process

#### Scenario: Script waits for a session

- **WHEN** a user launches with the wait option
- **THEN** the command stays active until that comparison window closes

### Requirement: Explicit comparison sources

The application SHALL accept file paths, directory paths, and Git source descriptors containing a repository and revision or live-state selector. Git snapshots SHALL be comparable within one repository or across repositories without common history. Directory comparison SHALL match relative paths and expose additions, removals, and changes.

#### Scenario: Unrelated repositories

- **WHEN** the user selects revisions from two repositories without shared history
- **THEN** the app compares their contents by relative path without checking out either revision

#### Scenario: Directory differences

- **WHEN** one directory contains a changed file and another contains a file absent from the first
- **THEN** the tree identifies both differences and selecting a text file opens its comparison

### Requirement: Safe unsupported-source handling

The application SHALL identify unreadable, binary, unsupported-encoding, and symbolic-link entries without silently altering their contents or recursively following directory links. Filesystem comparisons SHALL operate without Git installed; Git comparisons SHALL explain when Git is missing.

#### Scenario: Binary file selected

- **WHEN** the user opens a binary difference
- **THEN** the app shows a non-editable binary status and does not decode and save it as text

#### Scenario: Missing Git executable

- **WHEN** Git is unavailable
- **THEN** file and folder comparison remains available and a Git request reports the missing prerequisite

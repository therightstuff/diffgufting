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

### Requirement: Independent source lifecycle

Accepting a file or folder selection on either side SHALL immediately begin loading that side without requiring an opposite source or a Compare action. The application SHALL display a lone source without diff highlights or addition/removal classifications. It SHALL retain independent loaded state for each side. On the New page, two ready compatible sources SHALL remain a draft until Open comparison is selected; only that action SHALL register or activate the comparison.

#### Scenario: Open only one file

- **WHEN** the user selects a left file with no right source
- **THEN** the file loads and is displayed on the left without treating the missing selector as an empty comparison file

#### Scenario: Open only one folder

- **WHEN** the user selects a right folder with no left source
- **THEN** its file tree becomes browsable without diff statuses

#### Scenario: Complete the pair

- **WHEN** both selected sources finish loading
- **THEN** Open comparison becomes available and the creation page remains active until the user submits it

#### Scenario: Commit a manually entered path

- **WHEN** the user commits a changed source path with Enter or by leaving the field
- **THEN** the same loading and repository-discovery flow used for native browsing begins

#### Scenario: Select incompatible source kinds

- **WHEN** one loaded source is a file and the other is a folder
- **THEN** the application explains the type mismatch and prevents submission without displaying a misleading diff

### Requirement: Default launch shows New

Launching without explicit comparison arguments SHALL show the New comparison page with File/Folder selection and an explicit Open comparison action. Explicit valid CLI comparison arguments and reopening Recent entries SHALL continue opening their requested comparisons directly. Launching New SHALL NOT restore unsaved buffers from previous runs.

#### Scenario: Launch without arguments

- **WHEN** the application starts without an explicit comparison request
- **THEN** New is shown and no comparison is registered until submission

#### Scenario: Launch an explicit CLI comparison

- **WHEN** valid CLI sources are supplied
- **THEN** the requested comparison opens directly without requiring creation-page submission

### Requirement: Selection replacement preserves valid state

Each source selection SHALL have an identity that scopes asynchronous work. Replacement SHALL invalidate obsolete work and differences, preserve the opposite side's buffers and history, and protect dirty or contested documents before closing their final view. Errors SHALL be attributed to their side and SHALL NOT invalidate the opposite loaded source.

#### Scenario: Replace a source during a slow load

- **WHEN** the user chooses another left source before the previous left load finishes
- **THEN** old progress, prompts, results, and comparison results cannot overwrite the new selection, and the right source remains available

#### Scenario: Cancel replacement of edited contents

- **WHEN** replacement would close the final view of an unsaved document and the user cancels the save/discard/cancel prompt
- **THEN** the previous source, contents, history, and selection remain intact

#### Scenario: One source fails

- **WHEN** loading the left source fails while the right source is ready
- **THEN** the left shows a useful failure state and the right remains usable without stale differences

### Requirement: Estimated source progress ring

Each loading side SHALL show accessible phase-aware progress. File loading SHALL use observed bytes with estimates below completion until the source is ready. Folder discovery SHALL show an indeterminate indicator and discovered counts while retaining the inventory without content reads or a separate counting traversal. After discovery, folder comparison SHALL show resolved work against the unique discovered path total and SHALL reach successful completion only when the current comparison generation has no pending work. Source readiness SHALL NOT imply comparison completion. Intermediate notifications SHALL be bounded to at most ten per second per producer; initial and terminal states SHALL always be delivered. Incomplete discovery, cancellation, and failure SHALL be explicit.

#### Scenario: Load a large file

- **WHEN** file loading takes long enough for intermediate updates
- **THEN** that side's ring starts at zero, advances monotonically using observed loading work, and reaches a full circle only when its source is ready to display
- **AND** any subsequent comparison work has a separate visible phase

#### Scenario: Discover more folder contents

- **WHEN** traversal discovers more work than previously estimated
- **THEN** discovered counts increase alongside visible pending nodes without a misleading percentage or an additional counting pass
- **AND** content comparison uses the retained inventory after discovery finishes

#### Scenario: Cancel or fail a load

- **WHEN** loading is canceled or fails
- **THEN** the indicator transitions to the appropriate canceled or error state without showing successful completion

#### Scenario: Resolve folder comparison work

- **WHEN** discovery finishes for both compatible sources
- **THEN** comparison progress shows resolved paths against the unique discovered path total, including explicit unavailable outcomes
- **AND** inaccessible subtrees are labeled incomplete rather than implying all descendants were checked

#### Scenario: The inventory changes during comparison

- **WHEN** a filesystem change revises the discovered workload
- **THEN** a new generation visibly updates the workload and rejects obsolete progress and results
- **AND** progress is monotonic within a fixed generation and an empty comparison completes without division by zero

### Requirement: Linked browse starting locations

The application SHALL place a link/unlink control between the source selectors and SHALL start linked. While linked, an accepted selection on either side SHALL set both next browse locations to the selected file's parent directory or the selected folder itself. Linking SHALL NOT change either selected source or revision. Unlinked sides SHALL retain independent browse locations; relinking SHALL use the most recently accepted selection.

#### Scenario: Browse the opposite side while linked

- **WHEN** the user selects a left file and then browses on the right
- **THEN** the right dialog starts in that file's containing directory and the existing right source remains unchanged until a selection is accepted

#### Scenario: Unlink and relink

- **WHEN** the user unlinks, selects different locations on both sides, and relinks
- **THEN** unlinked browsing uses independent locations and subsequent linked browsing starts from the most recently accepted selection's location

#### Scenario: Cancel browsing

- **WHEN** the user cancels a native browse dialog
- **THEN** neither source nor stored browse location changes

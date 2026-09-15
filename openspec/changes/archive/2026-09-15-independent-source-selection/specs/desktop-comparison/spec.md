# Independent desktop sources

## ADDED Requirements

### Requirement: Independent source lifecycle

Accepting a file or folder selection on either side SHALL immediately begin loading that side without requiring an opposite source or a Compare action. The application SHALL display a lone source without diff highlights or addition/removal classifications. It SHALL automatically compare two ready, compatible sources and SHALL retain independent loaded state for each side.

#### Scenario: Open only one file

- **WHEN** the user selects a left file with no right source
- **THEN** the file loads and is displayed on the left without treating the missing selector as an empty comparison file

#### Scenario: Open only one folder

- **WHEN** the user selects a right folder with no left source
- **THEN** its file tree becomes browsable without diff statuses

#### Scenario: Complete the pair

- **WHEN** both selected sources finish loading
- **THEN** comparison starts automatically and only differences for that current pair are displayed

#### Scenario: Commit a manually entered path

- **WHEN** the user commits a changed source path with Enter or by leaving the field
- **THEN** the same loading and repository-discovery flow used for native browsing begins

#### Scenario: Select incompatible source kinds

- **WHEN** one loaded source is a file and the other is a folder
- **THEN** both remain selected and the application explains the mismatch without displaying a misleading diff

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

Each loading side SHALL show an estimated progress ring beginning at 0° and reaching 360° only when that source is ready to display. Intermediate progress SHALL be monotonic and below completion. Estimates SHALL reuse metadata and work observed during loading without a separate counting traversal or duplicate content reads. Intermediate progress notifications SHALL be bounded to at most ten per second; initial and terminal states SHALL always be delivered. The ring SHALL expose its estimated value and phase accessibly.

#### Scenario: Load a large file

- **WHEN** file loading takes long enough for intermediate updates
- **THEN** that side's ring starts at zero, advances using observed loading work, and reaches a full circle on successful completion

#### Scenario: Discover more folder contents

- **WHEN** traversal discovers more work than previously estimated
- **THEN** the ring does not move backward or report completion early and loading performs no additional pre-counting pass

#### Scenario: Cancel or fail a load

- **WHEN** loading is canceled or fails
- **THEN** the loading indicator transitions to the appropriate canceled or error state without showing successful 360° completion

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

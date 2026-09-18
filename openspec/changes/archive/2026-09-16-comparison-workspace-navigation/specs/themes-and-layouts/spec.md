# Workspace presentation

## ADDED Requirements

### Requirement: Runtime application icon identity

Development and packaged launches SHALL use `assets/branding/diffgufting-icon.png` or its platform derivatives for operating-system application identity, including applicable Dock, taskbar, application switcher, and launcher surfaces. The icon SHALL preserve the master artwork's proportions and complete silhouette.

#### Scenario: Launch the application

- **WHEN** the user launches either the development app or a supported desktop package
- **THEN** applicable operating-system application surfaces display the supplied application icon

### Requirement: Prominent file source headers

Each file pane SHALL display its file path and source identity prominently immediately above its editor. Git panes SHALL show the fixed revision label and applicable dirty circle; working sources SHALL be explicitly labeled. Unified layout SHALL expose both source identities above its editor. Merge layout SHALL label base, left, right, and result sources. Full paths and commit IDs SHALL remain accessible if visible labels are truncated.

#### Scenario: Browse a nested file

- **WHEN** the user selects a file inside a folder comparison
- **THEN** each editor header identifies that file's path and its own source version

#### Scenario: Switch to merge or unified layout

- **WHEN** the user changes layout
- **THEN** all represented source identities remain visible above their associated editor areas

### Requirement: Strong changed-text backgrounds

Changed character ranges SHALL use a stronger background than the surrounding changed-line background and SHALL NOT use an underline as their change decoration. Both light and dark appearances SHALL retain readable text and distinguish selection, search, and contention states. This treatment SHALL apply to inserted and deleted text in side-by-side and unified comparison views.

#### Scenario: Inspect a partial-line edit

- **WHEN** only part of a line changes
- **THEN** those characters have a stronger background without a change underline, while the rest of the changed line retains its softer highlight

#### Scenario: Change appearance

- **WHEN** the app changes between light and dark appearance
- **THEN** changed characters remain distinguishable and readable

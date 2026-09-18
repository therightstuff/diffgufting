# Themes and layouts

## Purpose

Define portable desktop presentation, visual identity, and state-preserving layouts.

## Requirements

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

### Requirement: Human-face pixel-art identity

The project SHALL use `assets/branding/diffgufting-logo.png` as its logo master and `assets/branding/diffgufting-icon.png` as its application icon master. Branding SHALL retain the supplied human face, shaggy black hair, floppy black ears, mismatched red and green eyes, tan beard, crooked teeth, and turquoise collar in pixel art.

#### Scenario: Display project branding

- **WHEN** the application or project documentation displays its logo
- **THEN** it uses the generated human-face logo or a proportion-preserving derivative of that master

### Requirement: Desktop icon derivatives

Desktop packages SHALL derive their platform icon formats and required resolutions from the generated icon master, preserving the complete head silhouette, transparency where supported, and crisp pixel-art character. Packaging SHALL include visual checks at 16, 32, 48, and 256 pixels and at native platform display sizes.

#### Scenario: Install a desktop package

- **WHEN** the user installs and launches a supported desktop package
- **THEN** the launcher and operating-system application surfaces use the human-face icon rather than a framework default, with no clipped ears or stretched proportions

### Requirement: Theme-independent branding

Themes and layouts SHALL preserve the human-face branding identity and keep it distinguishable against their backgrounds without using it as a Git category indicator.

#### Scenario: Switch between light and dark themes

- **WHEN** the user switches theme or layout
- **THEN** the same human-face identity remains visible with adequate silhouette contrast, using a backing surface if needed rather than recoloring its identifying features

### Requirement: Semantic themes

The application SHALL provide light and dark themes through semantic tokens covering operations, Git categories, contention, unsaved state, typography, and contrast. State SHALL be identifiable through labels or symbols as well as color. Theme selection SHALL offer Light, Dark, and Device and SHALL persist as a preference. Device SHALL follow the operating system's current light/dark appearance at startup and while the application is open. Explicit Light or Dark SHALL remain independent of OS changes. Existing saved selections and the current Dark default SHALL remain unchanged unless the user selects a different mode.

#### Scenario: Switch themes during contention

- **WHEN** the user changes theme while a region has staged, unstaged, and contention markers
- **THEN** all states remain distinguishable and the document contents remain unchanged

#### Scenario: Follow a device appearance change

- **WHEN** Device is selected and the OS changes between light and dark
- **THEN** the application updates its resolved appearance without remounting editors or changing buffers, selection, scroll position, history, or review state

#### Scenario: Keep an explicit choice

- **WHEN** Light or Dark is selected and the OS appearance changes
- **THEN** the application's selected and displayed theme remain fixed

#### Scenario: Restart with Device selected

- **WHEN** the user restarts after selecting Device
- **THEN** the selector still shows Device and the initial displayed appearance matches the current OS setting

#### Scenario: Preserve existing preferences

- **WHEN** an existing user opens the updated application with a saved Light or Dark preference, or with no saved theme
- **THEN** the saved explicit choice is retained or the existing Dark default is used

### Requirement: Replaceable layouts share document state

The application SHALL provide side-by-side, unified, and merge layouts through a layout registration contract. Documents, comparison data, selections, undo history, and review state SHALL be owned independently of layouts. Layout changes SHALL preserve editing state and logical viewport position where representable.

#### Scenario: Change layout after editing

- **WHEN** the user switches from side-by-side to unified view after an edit
- **THEN** the same buffer, selection, history, and pending review remain available and undo reverses the prior edit

### Requirement: Portable renderer boundary

The UI SHALL access filesystem, Git, and desktop capabilities through an explicit host interface rather than direct platform calls in presentation components. Browser delivery SHALL remain deferred.

#### Scenario: Renderer exercised without desktop host

- **WHEN** comparison data and a test host are supplied in a browser test environment
- **THEN** themes, layouts, and editor interactions function without importing Electron or Node filesystem APIs into presentation components

### Requirement: Persistent open comparisons region

The left sidebar SHALL reserve its bottom third for Open comparisons when expanded, with an independent scroll viewport from the files region. Its first entry SHALL be New…; each group SHALL occupy exactly one slot showing its current comparison, with a close button for that member and no history dropdown. Back/Forward arrows SHALL appear in the top source panel, not the Open comparisons heading, and SHALL navigate only the active group's comparison windows. They SHALL be disabled on New and at their respective history boundaries. New SHALL deselect the displayed comparison without removing its group's slot. The region SHALL be collapsible through an accessible header control. Its header SHALL remain visible when collapsed, the files region SHALL use the freed space, and expanding SHALL restore the bottom-third region. File scrolling SHALL NOT move Open comparisons out of view. The region SHALL remain available on New and when no comparisons are open.

#### Scenario: Browse a long file list

- **WHEN** the user scrolls through files
- **THEN** the Open comparisons region remains anchored at the sidebar bottom with its own independently scrolling contents

#### Scenario: Collapse and restore

- **WHEN** the user collapses Open comparisons
- **THEN** its accessible header remains visible and files use the released space
- **WHEN** it is expanded
- **THEN** it occupies the bottom third again with New… first and member close buttons available

#### Scenario: One slot represents all revisions and paths in a group

- **WHEN** a revision or source path changes in an open comparison
- **THEN** the existing group slot displays the new member without adding another slot; selecting an older member updates that same slot

### Requirement: Comparison root version controls

An open comparison SHALL identify each root file or folder and its relevant inline revision combobox at the top of the comparison. Root paths SHALL remain editable through typing and Browse; compatible replacements SHALL retain the current group. Browsing a child file SHALL NOT obscure or substitute that root scope. Existing pane headers SHALL continue identifying child file paths, fixed versions, and dirty states. New SHALL place equivalent revision controls beside its source selectors. Controls and labels SHALL remain usable in supported layouts and themes.

#### Scenario: Browse a child of a historical folder

- **WHEN** a child file is selected
- **THEN** the comparison header retains the folder root and its revision selector while the editor header identifies the child

# Themes and layouts

## ADDED Requirements

### Requirement: Human-face pixel-art identity

The project SHALL use `assets/branding/diffgusting-logo.png` as its logo master and `assets/branding/diffgusting-icon.png` as its application icon master. Branding SHALL retain the supplied human face, shaggy black hair, floppy black ears, mismatched red and green eyes, tan beard, crooked teeth, and turquoise collar in pixel art.

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

The application SHALL provide light and dark themes through semantic tokens covering operations, Git categories, contention, unsaved state, typography, and contrast. State SHALL be identifiable through labels or symbols as well as color. Theme selection SHALL persist as a preference.

#### Scenario: Switch themes during contention

- **WHEN** the user changes theme while a region has staged, unstaged, and contention markers
- **THEN** all states remain distinguishable and the document contents remain unchanged

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

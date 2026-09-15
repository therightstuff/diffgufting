# Device appearance preference

## MODIFIED Requirements

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

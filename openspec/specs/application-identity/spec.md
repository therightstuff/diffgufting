# Application identity

## Purpose

Define the desktop application identity and package-driven About information.

## Requirements

### Requirement: Application menu identity

Development and packaged launches SHALL display diffgufting as the application menu name on platforms with an application menu, rather than Electron. Existing native menu actions SHALL remain available. Identity initialization SHALL preserve access to existing preferences and recent comparisons.

#### Scenario: Launch on macOS

- **WHEN** a development or packaged build opens
- **THEN** the application menu is named diffgufting and native Quit and Hide actions remain available

#### Scenario: Preserve application data

- **WHEN** a user with saved settings and recent comparisons launches after the identity change
- **THEN** those settings and recents remain available even if runtime naming affects default storage paths

### Requirement: Package-driven About information

About SHALL display the existing application logo with preserved proportions, application name, version, and description sourced from package.json. package.json SHALL include repository metadata for https://github.com/therightstuff/diffgufting and support metadata for https://industrialcuriosity.com/shop. About SHALL provide separately labeled clickable repository and support links derived from those fields. The support label SHALL make clear that it supports the author's projects. About SHALL be reachable from an appropriate application menu on every supported desktop platform and usable offline.

#### Scenario: Inspect application information

- **WHEN** About is opened in development or a packaged build
- **THEN** it shows the logo and package metadata with no duplicated hard-coded version and exposes both project links

#### Scenario: Open a project link

- **WHEN** the user activates Repository or Support my projects
- **THEN** the corresponding package-configured HTTPS destination opens in the system browser without navigating the editor

#### Scenario: Dismiss About using the keyboard

- **WHEN** the user opens and dismisses About with the keyboard
- **THEN** controls are accessible and focus returns to the invoking application surface

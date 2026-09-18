# Desktop creation changes

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Default launch shows New

Launching without explicit comparison arguments SHALL show the New comparison page with File/Folder selection and an explicit Open comparison action. Explicit valid CLI comparison arguments and reopening Recent entries SHALL continue opening their requested comparisons directly. Launching New SHALL NOT restore unsaved buffers from previous runs.

#### Scenario: Launch without arguments

- **WHEN** the application starts without an explicit comparison request
- **THEN** New is shown and no comparison is registered until submission

#### Scenario: Launch an explicit CLI comparison

- **WHEN** valid CLI sources are supplied
- **THEN** the requested comparison opens directly without requiring creation-page submission

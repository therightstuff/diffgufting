# Sidebar and source header changes

## ADDED Requirements

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

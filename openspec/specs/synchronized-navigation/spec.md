# Synchronized navigation

## Purpose

Define coordinated cursor and scroll navigation plus a full-document change overview for active comparisons.

## Requirements

### Requirement: Active comparison pane synchronization

Cursor position, horizontal scroll, and vertical scroll SHALL synchronize across all visible file panes in the active comparison, including base and merge result. Synchronization SHALL map corresponding content across differences, use the nearest corresponding boundary for absent text, clamp columns and scroll offsets to valid target ranges, and preserve focus in the invoking pane. It SHALL NOT affect other comparisons, modify text, create undo entries, or recursively propagate updates. Layout changes and edits SHALL retain valid synchronization.

#### Scenario: Navigate unequal source files

- **WHEN** the user moves the cursor or scrolls either axis in a file containing inserted or deleted lines
- **THEN** all other active panes follow the corresponding content or nearest valid boundary without oscillation

#### Scenario: Navigate a merge result

- **WHEN** the user navigates in the editable merge result
- **THEN** the base, left, and right panes synchronize and keyboard focus remains in the result

#### Scenario: Keep other comparisons independent

- **WHEN** navigation changes in the active comparison
- **THEN** other open comparisons retain their navigation state

### Requirement: Full-document change overview

The editor area SHALL have a right-side overview covering the entire active document extent and displaying change locations and the current viewport/location indicator. Merge overview markers SHALL include differences involving the base, sources, and result. Clicking a location SHALL center its corresponding position in all active file panes, subject to document boundaries. Previous/next change actions SHALL use the same coordinated navigation. The overview SHALL update after edits and SHALL be empty, without markers or a pointer, when there are no changes. Navigation SHALL also be keyboard accessible and expose accessible location information.

#### Scenario: Jump to a distant change

- **WHEN** the user activates an overview location outside the visible viewport
- **THEN** every active pane centers its corresponding location and the indicator updates

#### Scenario: Remove the final difference

- **WHEN** an edit makes the compared contents identical
- **THEN** the overview becomes empty without stale markers or a pointer

#### Scenario: Changes span the document

- **WHEN** differences occur near the beginning and end of a long file
- **THEN** both are represented proportionally in the overview regardless of the current viewport

# Folder scrolling changes

## ADDED Requirements

### Requirement: Scroll-driven folder browsing

Folder tree and list views SHALL reveal further entries when their own viewport reaches the bottom of the currently exposed range, without a Show more button. Mounted rows SHALL remain bounded to viewport and overscan rather than growing with every reveal. The view SHALL preserve a stable scroll anchor and selection across additional entries and comparison updates, prevent duplicate in-flight range requests, and stop requesting at the end. Filters, tree expansion, and switching comparisons SHALL use the current inventory and reject stale results.

#### Scenario: Browse beyond the first range

- **WHEN** the user scrolls to the bottom of the visible folder range
- **THEN** additional entries become reachable without clicking a button or jumping back to the start

#### Scenario: Traverse a large folder

- **WHEN** repeated scrolling traverses thousands of entries
- **THEN** mounted rows stay within viewport and overscan limits and each entry remains reachable

#### Scenario: Reach the end or change filter

- **WHEN** no further entries match the current tree expansion and filter
- **THEN** further scrolling does not request nonexistent ranges
- **WHEN** the filter or expansion changes
- **THEN** the range and end state are recalculated for that view

# Desktop comparison progress

## MODIFIED Requirements

### Requirement: Estimated source progress ring

Each loading side SHALL show accessible phase-aware progress. File loading SHALL use observed bytes with estimates below completion until the source is ready. Folder discovery SHALL show an indeterminate indicator and discovered counts while retaining the inventory without content reads or a separate counting traversal. After discovery, folder comparison SHALL show resolved work against the unique discovered path total and SHALL reach successful completion only when the current comparison generation has no pending work. Source readiness SHALL NOT imply comparison completion. Intermediate notifications SHALL be bounded to at most ten per second per producer; initial and terminal states SHALL always be delivered. Incomplete discovery, cancellation, and failure SHALL be explicit.

#### Scenario: Load a large file

- **WHEN** file loading takes long enough for intermediate updates
- **THEN** that side's ring starts at zero, advances monotonically using observed loading work, and reaches a full circle only when its source is ready to display
- **AND** any subsequent comparison work has a separate visible phase

#### Scenario: Discover more folder contents

- **WHEN** traversal discovers more folder entries
- **THEN** discovered counts increase alongside visible pending nodes without a misleading percentage or an additional counting pass
- **AND** content comparison uses the retained inventory after discovery finishes

#### Scenario: Cancel or fail a load

- **WHEN** loading is canceled or fails
- **THEN** the indicator transitions to the appropriate canceled or error state without showing successful completion

#### Scenario: Resolve folder comparison work

- **WHEN** discovery finishes for both compatible sources
- **THEN** comparison progress shows resolved paths against the unique discovered path total, including explicit unavailable outcomes
- **AND** inaccessible subtrees are labeled incomplete rather than implying all descendants were checked

#### Scenario: The inventory changes during comparison

- **WHEN** a filesystem change revises the discovered workload
- **THEN** a new generation visibly updates the workload and rejects obsolete progress and results
- **AND** progress is monotonic within a fixed generation and an empty comparison completes without division by zero

# Changelog

## [consistent-editing-responsiveness] - 2026-09-18

### Changed

- Improved Git-backed editor responsiveness by reusing versioned comparison results across decorations, navigation, and secondary views while retaining correctness fallbacks.

## [comparison-creation-and-navigation] - 2026-09-18

### Added

- Added an explicit New comparison page with independently loaded sources, File/Folder selection, and an Open comparison action.
- Added retained comparison groups with sidebar navigation, group-local Back/Forward history, and inline Git version selection.

### Changed

- Updated folder browsing to scroll incrementally with bounded rendered rows.

## [application-identity-and-about] - 2026-09-16

### Added

- Added consistent diffgusting application identity and an accessible, package-driven About dialog for development and packaged desktop launches.
- Added repository and author-support links to About, opening in the system browser without navigating the editor.

### Changed

- Preserved existing preferences and recent comparisons when applying the runtime application identity.

## [comparison-workspace-navigation] - 2026-09-16

### Added

- Added persistent comparison workspaces and a recent-comparisons menu.
- Added synchronized pane navigation and a document-wide change overview.

### Changed

- Clarified Git source selection and display of fixed revisions, aliases, and base-relative changes.
- Improved editor source headers, application-icon integration, and changed-text readability.

## [optimize-comparison-engine] - 2026-09-16

### Added

- Added reusable performance, stress, and test-run reporting with durable timing artifacts.
- Added progressive folder inventories, bounded comparison work, and incremental diff-result reuse.

### Changed

- Improved desktop comparison loading, progress, external-change reconciliation, and theme switching.

## [independent-source-selection] - 2026-09-15

### Added

- Added independent source loading, linked browse locations, estimated loading progress, and scoped Git commit selection.

### Changed

- Streamed bounded commit-history pages with ref labels and immutable absent-path handling.

## [batch-document-undo] - 2026-09-15

### Changed

- Group adjacent typing and deletion into practical undo steps, with cursor-aware undo and redo.

## [follow-device-theme] - 2026-09-15

### Added

- Added a Device theme option that follows the operating system appearance while preserving explicit Light and Dark choices.

## [desktop-diff-editor] - 2026-09-14

### Added

- Added a desktop editor for file, folder, and cross-repository Git comparisons, with editable merges and hunk transfers.
- Added layered Git change views, external-change review, bounded undo history, theme and layout options, and platform packaging support.

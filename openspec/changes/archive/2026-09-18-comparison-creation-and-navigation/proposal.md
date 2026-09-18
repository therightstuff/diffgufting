# Comparison creation and navigation

## Why

Open comparisons can scroll out of reach, and source selection mixes creation with editing an existing comparison. A dedicated creation page and grouped revision history make comparison lifetime and navigation explicit.

## What Changes

- Add an explicit Open comparison action on a New page with a fixed file/folder choice and independent source and revision selectors.
- Keep explicit CLI comparisons opening directly.
- Reserve the sidebar's bottom third for collapsible, independently scrolling open comparisons, beginning with New… and retaining individual close buttons.
- Keep path and revision replacements in one stable group slot, represented by its current comparison, with group-local Back/Forward arrows in the top source panel and no history dropdown.
- Replace Git discovery prompts with inline revision selectors in creation and comparison headers.
- Replace folder Show more controls with scrolling and bounded mounted rows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `comparison-workspaces`: Explicit creation, immutable comparison type, related groups and group-local history.
- `desktop-comparison`: Load sources independently in a draft; open only on explicit submission; preserve CLI launch.
- `git-commit-selection`: Prompt-free revision selection and separate comparison activation from existing work.
- `progressive-folder-comparison`: Scroll-driven folder browsing with bounded rendering.
- `themes-and-layouts`: Persistent sidebar section and inline source-version controls.

## Impact

Affects renderer layout and controls, workspace/session lifecycle, host/preload APIs, and desktop interaction tests. Existing comparison identity, shared writable documents, recents, and dirty-document protection remain contracts. No dependency addition is planned.

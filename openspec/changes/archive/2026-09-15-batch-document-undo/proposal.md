# Batch document undo

## Why

The current document journal records every editor transaction separately, making ordinary typing tedious to undo. Undo and redo also leave the cursor at its previous position instead of the changed text.

## What Changes

- Group consecutive typing until five seconds of inactivity or an action boundary.
- Group consecutive backspaces separately from typing; treat Enter, cut, paste, merge, and other content actions as separate steps.
- End the active group when the user jumps to another location.
- Place the cursor after text restored by undo, or at the start of text removed by undo, with equivalent behavior for redo.
- Retain shared document ownership, bounded history, external-change history, and save semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `editing-and-merging`: Time- and action-based history groups and cursor placement during undo/redo.

## Impact

Changes `src/core/document.mjs`, timing defaults in `src/core/settings.mjs`, and transaction/selection integration in `src/ui/app.mjs`. Applies to every layout and shared document view. No new dependency is assumed. This change can be implemented independently of source selection and device theme.

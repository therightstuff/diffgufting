# Batch document undo design

## Context

`Document.replace` creates a delta for each replacement; the renderer labels all editor transactions `edit`. Undo/redo update text but not the stored selection. Shared document state already owns history across layouts, and history capacity is enforced per document.

## Goals / Non-Goals

Goals: predictable five-second inactivity groups, explicit action boundaries, useful undo/redo cursor placement, and unchanged disk/history protection.

Non-goals: persistent history, a second editor-owned history stack, source-selection changes, or a new history preferences UI.

## Decisions

### Keep grouping in the shared document journal

Pass semantic transaction metadata from the editor into the document: action kind, monotonic time, change ranges, and primary selection. Register `undoGroupDelayMs: 5000` in the real settings defaults. Keep a per-document active group, not per-view groups. Adjacent typing can join only the same kind of group, at the expected next position, with less than 5000 ms since the last edit. At or beyond 5000 ms, the next edit starts a new group. Logical expiration can be checked on the next transaction without a background timer.

Coalesce adjacent typing/backspace deltas incrementally; do not copy the whole document again solely for grouping. Store grouped action ranges where an atomic operation changes disjoint regions. Preserve the existing delta journal rather than introducing CodeMirror history, because model-driven merges/reloads and shared views must use the same undo stack.

### Define action boundaries explicitly

Typing and backward deletion have distinct group kinds. Consecutive adjacent backspaces join until five seconds of inactivity, cursor relocation, or another action. Each Enter, cut, paste, replacement command, transfer, merge resolution, and external reload is isolated from preceding and following typing. Forward deletion uses its own consecutive deletion group. Selection replacement is an atomic action; subsequent typing starts a new group.

An explicit caret/selection relocation, focus transfer to another editor, save, undo, or redo closes the current group. Navigation alone creates no content history entry. Automatic caret advancement from an edit and selection synchronization between views are not navigation boundaries. Use editor transaction annotations/input semantics instead of raw keydown alone so menus, accessibility input, and composition are handled. Never split an active IME composition into partially undoable text; classify its committed result before subsequent grouping.

### Set selection as part of undo and redo

For the operation being performed, collapse the primary cursor after the text it inserts/restores, or at the beginning of its removal if it inserts nothing. For replacement, the inserted/restored text wins. Undoing a backspace group therefore restores the characters and places the cursor after them; undoing typing puts it where that typing began. Redo applies the same rule to its own insertion/removal.

For disjoint changes in one action, use the changed range associated with the original primary selection; if none contains it, use the last changed range in document order. Store the necessary range metadata in the journal. Publish text and selection together before notifying views; reveal the resulting cursor in the invoking view without stealing focus to another shared view. Model-driven selection changes do not create boundaries or history entries of their own.

### Preserve capacity and save behavior

Treat a group as the undo/eviction unit and account for all retained deltas and cursor metadata. If extending a group would exceed the budget, close it and attempt the new edit as a new group under the existing oldest-first eviction policy. If the new operation itself cannot retain its prior state, preserve the buffer and offer the existing budget-increase/cancel flow. Pending external versions remain outside evictable history.

Save closes grouping but retains history. A new edit after undo clears redo. Layout changes retain journal contents and cursor metadata; they do not create content history. Keep status counts expressed as undoable groups.

## Risks / Trade-offs

- Selection events can accidentally split every typed character → distinguish edit-induced movement from explicit relocation and verify actual editor input.
- IME or menu actions can bypass keyboard classification → consume semantic editor events and exercise composition and menu paste.
- Five seconds can create large groups → keep the configured history budget authoritative and split safely at capacity boundaries.
- Disjoint changes complicate cursor mapping → retain operation ranges and verify replacement, search/replace-all, and merge cursor placement.

## Migration Plan

History is session-only, so no persisted journal migration is required. Add journal metadata and grouping before wiring editor semantics. Run model and desktop interaction coverage, including existing reload/merge/save behavior. Rollback loses only the new grouping behavior on restart.

## Open Questions

None blocking. The default pause is exactly 5000 ms; this proposal does not introduce a user-facing timing control.

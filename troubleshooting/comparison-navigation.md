# Comparison navigation verification

## Attempt 1 — Merge scroll ownership

**Hypothesis:** The result pane cannot synchronize because its editor is not the scrolling container.

**Action:** The focused `overview and cursor` desktop test recorded each editor's client and scroll sizes after an overview jump and result scroll.

**Result:** The three source scrollers had 148-pixel viewports; the result scroller expanded to its full 4555-pixel document height and stayed at scrollTop zero. Cursor mapping passed. The merge result flex child lacked a zero minimum height.

**Resolution:** Added zero minimum heights to merge flex children. After rebuilding, the focused test passed: the result had a 215-pixel viewport, scrollTop 1800, and horizontal offset 120; source panes followed the corresponding centered location with the same horizontal offset. Cursor alignment and focus preservation also passed. Removed temporary diagnostic output.

## Attempt 2 — Commit selection lifetime

**Hypothesis:** Forking a comparison dismisses the picker before its selected commit finishes loading, allowing subsequent source selection to overlap it.

**Action:** Captured comparison and source generation events in the focused commit-picker test.

**Result:** The new filesystem source reached generation 3 and offered its prompt, then the earlier commit selection loaded generation 4 and canceled it. The notice reported Source loading canceled. The workspace event handler closed the picker as soon as a selection forked its comparison.

**Next step:** Keep a selecting picker open until its sourceCommit request completes, and ignore late history pages belonging to a dismissed picker.

## Attempt 3 — Source input restoration

**Hypothesis:** Restoring source fields while creating a draft changes the committed input and triggers another load when the Git prompt takes focus.

**Action:** Inspected workspace activation alongside the input change/Enter handlers after the picker lifetime fix still failed the final prompt.

**Result:** Draft activation replaced the newly entered absolute path with the previous Git descriptor's repository-relative path. The input handler retained the earlier committed value, so blur loaded the programmatically substituted path as generation 4. This explains the cancellation after generation 3 offered its prompt.

**Resolution:** Restoring inputs only for completed pairs and updating their committed values eliminated the unintended load. The full picker sequence passed in 2.14 seconds after rebuilding, including selecting commits repeatedly and replacing the invoking source. Source inputs also remain disabled until host bootstrap completes.

## Review and final verification

Independent review found that leaving an edited lone source through Recent could orphan its document, and that a source-load reply could apply to another workspace with a coincidentally equal generation. Recent activation now protects the draft before disposal, document cleanup preserves shared ownership, and source state updates only through scoped events. The follow-up review found no further confirmed issue in those fixes. The desktop regression exercises Cancel and Discard, then loads another source and closes cleanly without stranded dirty buffers.

One merge-close assertion raced the current dirty-state update. Native closure now asks the ready renderer for current state; renderer failure still permits closing. A typing assertion also captured intermediate rendered text; explicit waits for typed text and the new line passed on the focused rerun. No failing behavior remains in these focused checks.

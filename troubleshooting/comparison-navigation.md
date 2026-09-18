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

## Attempt 4 — Viewport shell regression

**Hypothesis:** The application shell styles were missing rather than the logo asset being oversized.

**Action:** Compared the current stylesheet with the repository version and captured the startup window after restoring the shell rules.

**Result:** The current stylesheet lacked the `body`, `header`, source-bar, main-layout, and workspace sizing rules. The restored startup window keeps the logo at 48 pixels, anchors controls at the top, and keeps file and comparison regions inside the viewport.

**Resolution:** Restored the shell styles and retained the new independent sidebar regions.

## Attempt 5 — Incomplete creation lifecycle

**Evidence:** The applied checklist contained only two completed tasks. New reused a draft, draft comparison events were suppressed, and the source bar did not distinguish creation from an opened comparison.

**Resolution:** Added an empty New page, explicit ready-pair submission, host type validation, and per-group revision navigation. Desktop regressions exercise visible controls at minimum and default window sizes, draft dirty protection, and branch/tag/working selection without discovery prompts.

## Attempt 6 — Folder refresh and submitted-source watching

**Evidence:** The large-folder regression lost its selected row during refresh. Its refresh button also scrolled the Files region to the top because the header moved with the list. A separate host regression showed that a draft started with no source roots never attached watchers when submitted.

**Resolution:** Retain the displayed comparison while its refreshed inventory loads, keep Files controls sticky, and attach newly selected roots at submission without duplicating existing watchers. Tests verify selection and scroll preservation after adding an entry, and observation of external changes after submitting a draft.

## Attempt 7 — New prompts to discard loaded work

**Hypothesis:** New treats a loaded workspace as disposable until explicit submission, even when it already displays two folders and editable child files.

**Action:** Rebuilt the renderer and changed the existing edited-draft desktop test to require no close prompt on New. Traced sidebar, File menu, and Recent activation through `protectDraft()` and host draft disposal.

**Result:** The regression failed because the close dialog was visible. The earlier passing tests began with registered comparisons; a different existing test explicitly required discarding an edited draft. An older build was not established as the cause.

**Resolution:** Retain loaded drafts as selectable workspaces through navigation. Keep dirty-document protection for explicit closure and destructive draft changes. Rebuilt desktop tests cover two loaded folders with edited child files before and after submission, sidebar and File-menu New, restored edits and undo, and Recent navigation. Host tests cover retained-draft activation, submission, deduplication, and closure.

## Attempt 8 — Initiated comparisons lack history and current titles

**Evidence:** Drafts entered the sidebar only when retained during navigation, and their labels were captured then. A completed pair without explicit submission still took the in-place draft source replacement path, so it had no group history.

**Resolution:** Publish the sidebar entry and current title on source-state changes, starting with the first loading event. Preserve a completed pair through registration before changing its path or revision, then open the replacement in the invoking group. Renderer replacement protection permits that non-destructive transition. The initial host regression failed on the absent sidebar entry. Rebuilt desktop tests cover folder and revision replacements before and after submission, distinct member identities, enabled Back/Forward controls, matching sidebar titles, and restored edits.

## Attempt 9 — Navigation waits for folder replacement completion

**Evidence:** A related replacement called `open()`, which did not register its record or append a group visit until canonicalization, source loading, and comparison calculation completed. Folder inventory work therefore delayed Back/Forward availability.

**Resolution:** Create a pending group member before the first asynchronous replacement operation, make it current, and publish it immediately. Successful loading finalizes that record; errors, cancellation, and exact-identity deduplication remove it and restore the previous member. Host and desktop regressions verify Back is enabled immediately, including during folder replacement, and existing incompatible-replacement recovery remains intact.

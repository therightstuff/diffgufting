# Large-folder discovery responsiveness

## Attempt 1 — Find work outside the discovery worker

**Hypothesis:** Folder enumeration blocks the application thread.

**Action:** Traced source loading through the source worker, Session inventory handler, and renderer. Ran the bounded-batch host regression and the 10,000-file desktop discovery regression before changing implementation.

**Result:** Enumeration already used a worker. However, the host rebuilt and sorted the growing inventory, serialized it into the cache, and forwarded the whole prefix for every batch. The renderer rebuilt the list for each event. For 10,000 files, IPC delivered 505,000 entry records and a largest batch of 10,000; the measured host event-loop gap reached 253 ms. The worker also walked the folder again to construct its source tree.

## Attempt 2 — Keep discovery work in the worker and make delivery linear

**Action:** Reused the worker inventory, forwarded bounded append deltas, removed repeated host sorting/cache serialization, and coalesced renderer updates to animation frames.

**Result:** The same regression delivered exactly 10,000 entry records in batches no larger than 100. The measured host gap fell to 31 ms and renderer frame gap to 51 ms. Source/session and desktop discovery tests passed. These are local measurements, not universal timing guarantees.

**Verification:** The affected source/session/workspace and desktop discovery/navigation/editor suites passed together in run `d2f86359-7e64-4213-90a2-bee7be1a34bb`, including cancellation during batch delivery and returning to New without stale rows. Build, syntax, and whitespace checks also passed. No remaining issue was observed in these regression cases.

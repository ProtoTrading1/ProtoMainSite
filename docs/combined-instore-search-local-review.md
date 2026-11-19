# Cross-catalogue Instore search — local follow-up

19 November 2026; task-owned changes on agent/instore-search-speed after #308.
Local only: do not infer deployment or public source approval from the earlier PR.

The private screenshot's supplied OCR identifies “More matching products across
Proto”, “58 in the main catalogue · Searching Instore...” and “Searching the
Instore collection...”. This is the cross-catalogue results section in
MainContent, not the dedicated Instore page. No private screenshot is committed.

The prior implementation checked instoreCatalogue() once, after a 250 ms timer.
If the collection was absent then, it started a paged request (45 s deadline).
It did not subscribe to collection hydration/refresh, so the network request
could keep the section pending even after the local catalogue became available.
#308 already reduces matching/ranking work; this change fixes that separate wait.

useInstoreSearch now subscribes to the canonical collection and hydrates promptly.
A local collection answers immediately without the 250 ms debounce. Network
fallbacks remain debounced, and are cancelled when the query changes, the
collection arrives, the feature is disabled, or the component unmounts. Query
identity and cancellation guards reject stale responses before applying results.
A blocked browser store does not prevent the network fallback from starting.

MainContent now has one prominent burgundy Searching Instore status with a
spinner, polite atomic announcement, current-query context and reduced-motion
support. Removed the duplicate pending phrase from the heading. Main products
stay available. The results' aria-busy wrapper excludes the live status so it
does not suppress the searching announcement. Empty and error outcomes remain
distinct and end the pending state.

Verification: 803 node tests passed, changed-file lint and production build
passed, whitespace check passed. Eight new desktop/mobile browser cases passed:
slow response with one active status/main results retained, catalogue arrival
while a paged response is deliberately held, stale-query completion/clear, and
empty/error separation. Tests exercise the actual MainContent and hook with
synthetic accounts/products. The catalogue-arrival case filters 5,000 synthetic
products and returns 12 of 278 bracelet matches before the held request is
released; subsequent hair-clip search makes no further paged request.

Local logs: /workspace/artifacts/combined-instore-search/. These controlled waits
separate the fetch delay from local processing; no authenticated production
request timing was obtained. Uncached server/network time is still a limitation.
The existing hosted-browser proxy/credit blockers remain. No merge, deployment,
production data change or expanded public upload was performed.

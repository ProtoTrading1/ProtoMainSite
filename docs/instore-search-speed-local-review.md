# Instore search speed — local verification, 19 November 2026

Prepared on `agent/instore-search-speed`, based on production `e77f275`.
The user approved public upload of this named branch and generic payload.
Draft PR/preview preparation is authorized; no production release, database or
product change is included.

## Cause and correction

For every product, the shared Instore matcher repeatedly parsed the same query,
expanded language families and rebuilt alternatives. Sorting also reinterpreted
the query and recalculated both products' title scores for every comparison.
Compile matching rules once per result set and memoize ranks within that search.
Use that context in the shared page function and the API feed builder. The main
search's Instore suggestions and dedicated Instore search both use this path.

Query contexts are local to a call, with no global query or result cache. Preserve
identifier priority, exact-title ranking, language/typo/structured constraints,
stable ordering and paging. Existing eligibility, stock, visibility, duplicate,
photo and ordering gates remain in their original paths.

## Evidence

- 803 node tests passed, changed-file lint and production build passed.
- 138 frozen pages captured using the pre-change implementation assert the exact
  membership, order, totals and pagination for 23 queries, three categories and
  two pages. Includes structured constraints, identifiers, typo and no-result cases.
- Eight desktop/mobile browser checks passed: two search scenarios plus the six
  existing gallery/cache regression scenarios. A background refresh returning 503
  does not block cached searches, which issue no further catalogue requests.
- Two additional browser checks use a separately bundled production fixture with
  CPU slowed fourfold. Desktop submit-to-result times: bracelets 1,145 ms,
  hair clips 670 ms, SKU 193 ms, no results 188 ms. Mobile: 730/584/431/226 ms.
  These include rendering, unlike the matching-only benchmark below.
- An initial development-build run with fourfold slowdown exceeded the 1,500 ms
  target (desktop 1,911 ms / mobile 1,701 ms). The normal development-run test and
  the separately bundled production fixture pass. Do not claim every low-end
  device will respond instantly.
- Same-host matching benchmark, three runs, 5,000 synthetic products; exact old
  versus new output equivalence asserted each run. Median milliseconds:

| Query | Before | After |
| --- | ---: | ---: |
| bracelets | 3,070.9 | 30.9 |
| hair clips | 2,055.5 | 34.0 |
| blue beads under R100 | 454.7 | 31.9 |
| K100032 | 11.3 | 6.5 |
| unfiltered | 240.3 | 10.4 |

All figures are local synthetic evidence, not measurements from a customer's
signed-in session. Cold catalogue downloads, network latency and API/database
latency are not eliminated by this change. Test fixtures stay outside the normal
production entry and use synthetic authentication only.

## Remaining review and hosted acceptance

- CodeRabbit is not installed. Its official CLI installer request returned HTTP
  403; no CodeRabbit review ran. Restore access to the installer, install the CLI,
  authenticate with `coderabbit auth login --agent`, and run the scoped review.
- Impeccable was absent from the cloud/executor skill catalogues and workspace.
- `proto.co.za` redirects to `www.proto.co.za` via the web reader. Workspace
  Chromium failed with `ERR_TUNNEL_CONNECTION_FAILED`; curl confirmed proxy
  CONNECT 403. Browser Use explicitly returned `insufficient_credits`. No proxy
  bypass, credentials extraction, access-sharing or protection change attempted.
- The Proto engineering skill's named `site_preflight.sh` was unavailable through
  its resource and filesystem searches. Inspected repository, clean initial
  worktree, branch, refreshed origin/main, repository instructions and actual
  `www.proto.co.za` deployment mapping directly instead.
- The user approved generic source upload to the public repository and a draft
  PR/preview for hosted acceptance.
  Any go-live for this separate performance change remains a later release step.
- On an approved preview, verify cold and warm main/Instore searches, exact SKU,
  description, structured constraints, no-results, clear, gallery and ordering
  controls with the normal authorized account. Do not change product or stock
  data to test search. Check both desktop and mobile and compare timings against
  the current production version under the same network and cache conditions.

## Preview handoff

Draft PR: https://github.com/ProtoTrading1/ProtoMainSite/pull/308

Verified READY preview for source 5a111242a800ca66e39a3c5bf23498829f82824e:
https://protoportal-main-ihyeuyo83-proto-team.vercel.app

The CodeRabbit repository app explicitly skipped the draft under its default
policy. No CodeRabbit review has run; Release safety CI is pending. Production
www.proto.co.za remains on dpl_DZuAN8jW7ECisdrJNBJBTNL4ZTV2. The preview build
uses ordinary project access; no sharing link or protection change was created.

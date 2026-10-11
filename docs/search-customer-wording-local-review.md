# Local customer search review — 11 October 2026

## Delivery and release boundary

Repository: `ProtoTrading1/ProtoMainSite`. Local worktree: `C:\Users\georg\Documents\Codex\2026-10-11\task\search-title-fix`. Branch: `agent/search-title-price-intent-20261011`. Baseline: `d954e78fb5ed57bbeb0794f644c96ff67af8c69b`.

Origin main and the READY production storefront deployment both resolve to that baseline. Production project is `protoportal-main`, deployment `dpl_6hmHaLM7XcPxaTYKfWxTwyW5ZQc8`, with `www.proto.co.za` among its aliases. Full remote fetch found no commits newer than 10 October 16:00 UTC. PR269 is already merged into this baseline; its stock and basket guards remain intact.

The existing dirty `codex/normal-stock-cap` checkout was preserved. This task used a fresh clean worktree. No source push, PR creation, merge, deployment, database write/migration, credential/access change or customer-data mutation occurred. Stock, prices, minimum orders, visibility, arrived/new-product flags and hidden scarves were not edited. The requested 52 arrived/97 new/10 hidden counts were preservation constraints, not independently recounted claims.

## Verified causes and catalogue evidence

### Hoco technical title was mistaken for a price request

Input: `Hoco C102a – 4 USB Ports, Max 28.5w, Qc3.0 Fast Charger`.

The old parser normalized punctuation before extracting money constraints. It changed `Max 28.5w` to `max 28 5w`, interpreted `max 28` as `priceMax: 28`, removed those words and left lexical text `hoco c102a 4 usb ports 5w qc3 0 fast charger`. Products priced above R28 were rejected before title matching. A fixture matched at R20/R28 but failed at R28.50/R100. The same ordering corrupted `charger under R28.50` into an R28 ceiling plus mandatory `50` text.

SKU `1002110432` exists in website stock with the exact title and a pipe-separated original description. Its current stock/available stock is -2; historical 10 October stock was not established. The fix corrects matching without bypassing current stock/basket restrictions. Browser regression fixtures deliberately use synthetic positive stock and price R100.

### Leather bag counts reflect different catalogue scope

Same-session shopping events: 10 October 09:49:01 UTC, source `instore`, main 0 + Instore 2 = 2; 09:51:01, source `main`, main 49 + Instore 2 = 51. Later search analytics recorded 49 with null filters. This supports catalogue/count semantics as the explanation, not a proven asynchronous bug. Existing query-identity, cancellation and loading-aware analytics protections were retained; a delayed obsolete response regression now verifies those protections.

### Material and missing-product terms

Viewed basket `8626000614` is `CRAFT BASKET 5 IN 1`, stock 240, with no verified wicker material in its title/description. No wicker synonym was added. Other source-inventory wicker items have explicit wording but do not establish this basket's material.

Garden-light source inventory includes `8710600001` and `VBHW80`; trolley cases include `602-65`, `605-65`, `CT779-60`. These were absent from the relevant customer catalogue, so changing matching cannot expose them safely. Gingerbread house/stickers do not prove gingerbread man; a sewing set in a black case does not prove a sewing-machine bag. No corresponding incoming status was verified. No alias or visibility change was made for these gaps.

Read-only checks used stock project `yiqsvwajozafvalwcero` and analytics project `kyodrsqnmihwoplkhwwf`, limited to relevant product and search-event fields.

## Implemented scope

- Extract genuine monetary constraints before punctuation normalization; reject technical units and prevent decimal/alphanumeric regex backtracking. Preserve R28.50 and R28,50 budgets.
- Share conservative singular/plural normalization across Main and Instore; prioritize exact titles and exact identifiers, retain partial and reordered all-word matching, and index useful description/brand fields.
- Include exact, prefix and conservative typo candidates together, bounded to 120 candidates per dataset. Retain adjacent transpositions; restrict generic edits to alphabetic words of at least six characters. Negative tests prevent `blush` becoming `brush` and concrete-object/category leakage.
- Require concrete object evidence from specific fields rather than broad categories such as `Bags & wallets`. Preserve verified synonym families and the existing related-wording label; no unsupported material inference or broad fallback was introduced.
- Preserve raw query punctuation in suggestion cache keys so R28.50 cannot reuse the intent of R28 50.
- Match normalized Instore identifiers against the complete existing eligible snapshot, retaining category scope, exact identifiers before allowed letter-suffix variants, and excluding extra-digit neighbours. This handles old stored tokens such as `AB-12` when queried as `AB12` without a migration.
- Add regression coverage for titles, technical punctuation, budgets, plurals, ranking, brands/descriptions, identifiers, catalogue filters, material/object relevance, measurements, loading and obsolete responses.

Server identifier searches now scan the eligible stored snapshot using existing bounded pagination/completeness checks. Hosted latency for this path has not been measured; it is the principal implementation tradeoff.

## Daniel's work and overlap

[Proto_Admin PR274](https://github.com/ProtoTrading1/Proto_Admin/pull/274) is OPEN, DRAFT and UNMERGED, titled `[Do not merge — separate URL] Admin redesign with live-data Home`. Head: `9ce8fd3dd1505369541e90da45caf51aedbe1470`, branch `claude/determined-shannon-1j11y8`; base main: `a8806d15`. Scope: 21 commits, 140 files.

Actual additions include live-data Home metrics/sparklines, DailyWebsiteReport and its daily-report API/library, MarketingOverview, CommandPalette, grouped navigation, dark theme and restyled AnalyticsHub/Customers/site content. The preview also removes Image Studio, Pricing, Hermes, Product Intelligence, Buying, Order Workspace and Search & Shopping/Instore dashboards. Its reporting/navigation changes do not implement this storefront matcher.

Latest READY preview observed: [protoportal-admin-qlpbokl8q-proto-team.vercel.app](https://protoportal-admin-qlpbokl8q-proto-team.vercel.app), 10 October 21:02 UTC. Admin production remains the 8 October main `a8806d15`, deployment `dpl_EPM5e5smjfUqwN8SVUWepxhFDf9A`. PR author is `danieljoffeinfo-web`; latest commit author/committer is `claude`, and Vercel deployer is `geozi1-8936`. These identities describe different actions.

The [change journal](https://github.com/ProtoTrading1/Proto_Admin/blob/9ce8fd3dd1505369541e90da45caf51aedbe1470/md/changes/2026-10-10.md) reports its own tests; those checks were not rerun here. No Daniel branch was merged or modified.

## Initial validation and limitations (before the broader audit)

- `npm test`: **648 passed, 0 failed, 0 skipped**.
- ESLint on all seven changed code/test files: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- `PROTO_PLAYWRIGHT_PORT=4187 npx playwright test e2e/search-navigation.spec.js e2e/search-stock-available.spec.js --workers=2`: **20 passed**, desktop and mobile Chromium.
- Independent worker review: no remaining material findings; 31 focused tests passed independently.
- Desktop/mobile exact-title screenshots were inspected under `test-results/.../exact-title.png`; fixture missing product images are deliberate. Tests assert no page errors. An existing React `fetchPriority` warning remains outside this change.

Full repository browser suite and repository-wide lint were not run. Hosted preview/production behaviour and identifier-query latency remain unverified; no source publication was authorized. Native CUA reported no enabled browser/app surfaces, so rendered checks used local headless Playwright. The skill's named `site_preflight.sh` was absent; equivalent repository, branch, production-head, dirty-checkout and deployment checks were performed directly. Normal sandbox shell startup failed; authorized local commands succeeded through automatic escalation review with no rejection.

Publication, if later authorized, would push only branch `agent/search-title-price-intent-20261011` containing the search/test files and this report, including the broader-audit additions below. No hosted preview was requested or created.

## Broader end-to-end audit continuation

The original email `1a12997bac4dc09f` supplies **27 distinct terms / 40 searches**, with historical combined Main + Instore counts. Ten searches were Instore-only, but the email does not allocate their terms. Mould has three searches and two listed counts without per-event allocation. The email does not provide filters or chronology for all events. Current matching fixtures therefore assert semantics, not the original counts. The complete 27-term corpus is committed in `tests/fixtures/search-report-corpus.js`.

The broader audit replayed every term through both matching functions and rendered Main/Instore on desktop/mobile. Instore replay uses its actual input and submit path. Safe fixtures are hermetic: they do not contact production services. This exposed additional code defects beyond the initial Hoco fix.

| Area | Finding and status | Implemented correction / regression evidence |
|---|---|---|
| Hoco exact technical title | Verified defect, fixed | Parse money before punctuation; technical ratings remain words. Exact/partial/punctuation/reordered, R28.50 and stock intent unit/browser checks. |
| Jump ring / Split ring | Verified Main wording opportunity, fixed | Shared singular/plural matching. Current Main has four JUMP RINGS rows and KEYRINGS (SPLIT RINGS), while Main analytics was zero and Instore supplied combined 10/1. No eligibility changes. |
| Leather bag 2→51 | Catalogue/count semantics supported; no proven stale bug | Preserve Main + Instore scope. Plural/order variants and committed/pending/obsolete-response regressions. Historical contexts beyond the verified events remain unknown. |
| Wicker / basket | Unsupported material alias excluded | Basket title/description does not establish wicker. Negative material regression; no data alteration. |
| Garden lights / trolley bags | Source inventory exists outside relevant customer catalogue | No safe matching-only fix can publish those items. Synthetic empty-state checks; catalogue/intake decision remains outside scope. |
| Gingerbread man / sewing machine bags | Requested object not established by house/stickers/sewing-set entries | All-word/object negatives remain empty; no guessed alias or incoming status. |
| Other 18 email terms | All wording cases pass safe Main/Instore fixtures | Ring display; Metal Charm Watermelon; Metal charms; Charm; Ldnio LC111 full title; Yesplus YS-1214 full title; FLASH32 full title; Basket; Leather; Chain; Lobster; full silver/nickel-free lobster title; Ring; Mug; Chocolate; Mould; Christmas; Organza. Historical counts are not asserted. |
| Full title ending in colour | Verified Instore boundary defect, fixed | UI, route and API truncated at 80 characters, dropping final qualifiers. Shared bounded 400-character limit; input value/URL tests and grey-versus-black API regression. |
| Technical slash punctuation | Verified API boundary defect, fixed | API stripped `/` before matching. Preserve punctuation for shared parser. Beads 11/0 positive and 11/1 negative API test. |
| Numeric and connector relevance | Verified Main defect and cross-field contamination, fixed | Main ignored one-character digits and contextual letters. Preserve digits and letters after USB/type/class/grade/size. Shared intent also binds decimal versions, electrical ratings, connector/class/grade letters and port counts into adjacent technical atoms, so Pack 1 / Grade C elsewhere cannot satisfy QC3.1 / USB-C. QC3.0/3.1, 4/3 ports, 11/0 vs 11/1, 0.5/1.5W, USB-A/C and Type A/B regressions, including unrelated qualifiers in another field. |
| Grouping after budgets/size/colour/stock | Verified pipeline defect, fixed | Barcode sibling expansion reintroduced rejected variants; image-bearing expensive/wrong-size/out-of-stock sibling became card representative. Enforce intent after expansion. Unit tests plus rendered R25 white charger→basket excludes R100 black sibling. Unconstrained alternatives remain. |
| Bare model C102a | Verified title-model gap, fixed narrowly | Whole mixed-letter/digit title/name token fallback below exact SKU/barcode. No numeric, labelled, punctuated or appended-digit title fallback. Dedicated tests and stored category-scope test. |
| Brands / multiword / conservative typos | Supported wording verified | Brand/description fields, all words, prefix and adjacent typo checks; negative blush/brush and category/object leakage tests. |
| Identifier correctness | Verified local behaviour | Exact SKU/barcode before allowed letter suffix; no extra-digit neighbours. Existing eligible stored snapshot, category scope and completeness guards. |
| Identifier latency | Local synthetic CPU measured; hosted blocker | 1k rows: pure matcher 3.08ms / stored stub 2.29ms; 10k: 18.31/15.84ms; 40k: 61.49/61.10ms. Snapshot path transfers 1/10/40 pages respectively. These omit network/database latency. Hosted latency must be measured before release readiness. |
| Main/Instore pagination | Verified rendered behaviour | Main 65 rows: 60→5→60, new query reduces to one; Instore 53 rows: next/previous/route reload. Main page is local component state; reload persistence is not a promised change. |
| Debounce / loading / obsolete responses | Verified fixture behaviour | Rapid typing + Enter cannot resurrect old debounce; pending response hides prior query; late response cannot overwrite committed query. Loading telemetry avoids premature zero counts. |
| Instore next edit after submit | Reproduced during repeat browser run; fixed | Route echo unconditionally reset the input to the previous submitted query, losing the next edit. Compare incoming route with current submitted query before synchronizing input; the full corpus input-submit replay exercises consecutive edits. |
| Availability / basket | Verified local safe journey | Arrived negative-stock row shows Stock available and adds; unavailable row disabled; ordinary row adds; grouped constrained variant adds. Slow fresh Instore stock response and failed lookup/retry tests retain authoritative stock behaviour. |
| Mobile / empty state | Verified rendered behaviour | Both layouts replay complete corpus; no horizontal overflow. Existing quick-result touch target/wrapping tests; unsupported terms remain empty and expose recovery without inventing product/material matches. |
| Hidden sold scarves / production flags | Preserved, no data changes | Listing-hidden API negative plus existing eligibility tests. No stock, arrived/new flag, visibility or customer data writes. No claim that synthetic tests establish historical live counts. |

Live read-only title evidence: Ldnio grey `6010305` stock 4; Yesplus white `YS-1214WHT` and black `YS-1214BLK` stock 8 each, shared barcode `3050292`; FLASH32 `FLASH-32GB` stock 0; silver/nickel-free lobster `00267S` stock 170 and nickel-free-only `00267NIC` stock 28. These establish fields and distinguish variants; they do not authorize stock or visibility changes.

Release remains withheld. No source push or hosted preview was made. Full repository lint/browser suite, hosted APIs/database latency and all 40 historical event contexts remain outside the verified evidence. Bare unqualified wording such as `maximum 5` is inherently ambiguous between capacity and price; supported technical units are protected, but no new capacity-unit dictionary was guessed.

### Final validation of the broader changes

- Full `npm test`: **657 passed, 0 failed, 0 skipped**.
- ESLint on all **18 changed code/test files** across both local commits: passed, zero diagnostics.
- Production bundle build: passed; `git diff --check`: passed.
- Expanded seven-spec desktop/mobile browser run: **63 passed / 1 intentional skip / 0 failures**. Specs: search corpus, search navigation, search stock available, Instore stock, stock-available label, shopping analytics, search tip. The skipped mobile case uses the desktop-only About Us navigation control.
- A later core repeat found **29 passes / 1 failure**, exposing the Instore route-echo race above. It was corrected locally and the final core rerun is recorded below; the failure was not dismissed as a test flake.
- After correction, the full search corpus/navigation/stock-to-basket core passed **30/30** desktop/mobile checks. The corpus suite then passed **16/16** with `--repeat-each=2`, including consecutive Instore input edits, full titles, grouped basket addition and Main pagination. The final ref synchronization uses an effect; changed-file lint and build passed again after that adjustment.
- Final focused semantic/API/pipeline checks: **41 passed**. All 27 report terms replay through both matchers and both rendered catalogue scopes. These are independent query/fixture assertions, not reconstructed historical result counts.
- The known existing `fetchpriority` React console warning remains. New synthetic corpus tests assert no page errors and no horizontal overflow; image placeholders are intentional.

This is bounded local evidence, not comprehensive production readiness. Hosted latency/API verification and operational catalogue decisions remain the release blockers. Branch payload includes matching/parser/grouping changes, Instore query boundaries, their regression tests and this findings matrix. Production/data guards were retained.

An automatic approval review rejected a proposed `git restore` formatting cleanup because it might discard edits. It did not execute. A safer cleanup verified exact content equivalence apart from newline encoding, backed up the file and restored its original mixed newline layout while retaining the task change. No work remains blocked by that rejection.

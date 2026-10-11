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

## Validation and limitations

- `npm test`: **648 passed, 0 failed, 0 skipped**.
- ESLint on all seven changed code/test files: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- `PROTO_PLAYWRIGHT_PORT=4187 npx playwright test e2e/search-navigation.spec.js e2e/search-stock-available.spec.js --workers=2`: **20 passed**, desktop and mobile Chromium.
- Independent worker review: no remaining material findings; 31 focused tests passed independently.
- Desktop/mobile exact-title screenshots were inspected under `test-results/.../exact-title.png`; fixture missing product images are deliberate. Tests assert no page errors. An existing React `fetchPriority` warning remains outside this change.

Full repository browser suite and repository-wide lint were not run. Hosted preview/production behaviour and identifier-query latency remain unverified; no source publication was authorized. Native CUA reported no enabled browser/app surfaces, so rendered checks used local headless Playwright. The skill's named `site_preflight.sh` was absent; equivalent repository, branch, production-head, dirty-checkout and deployment checks were performed directly. Normal sandbox shell startup failed; authorized local commands succeeded through automatic escalation review with no rejection.

Publication, if later authorized, would push only branch `agent/search-title-price-intent-20261011` containing the seven search/test files and this report. No hosted preview was requested or created.

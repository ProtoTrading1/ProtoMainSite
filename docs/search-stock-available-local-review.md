# Search stock availability local review

Local draft branch: `agent/search-stock-available`, based on refreshed `origin/main` commit `39f505317c7ebbc2b09e0c94c0126dddc8661cac`. Prepared as a local commit for review. Branch publication, hosted preview and production release are not authorized by the earlier exact stock-label candidate approval.

Search previously ignored the API's shared availability object, showing Out of stock for a confirmed landed product with negative recorded stock. Search now uses the shared incoming-stock labels, including Stock available for `landed_awaiting_grv`. SKU `8616000132W` is covered with synthetic fixtures representing price R49.50 incl. VAT, pack of 50 and recorded stock -23. These are test inputs, not fresh live verification.

## Ordering policy delta for review

The previous frontend and server guards allowed only explicit To order products to exceed recorded stock. This draft also permits an order request for confirmed arrived stock when the authoritative availability has state `landed`, `canOrder === true`, status `landed_awaiting_grv`, a positive arrival marker, and a known nonpositive recorded stock quantity. Search, product cards, basket and server per-line/aggregate validation share that rule. The server obtains its availability from the existing stock source and RPC, never from a submitted browser flag.

The marker indicates arrival and is never converted to a stock quantity or used as a ceiling. No invoice quantity is used to infer remaining stock. Positive recorded stock retains its whole-unit and aggregate cap, missing stock is blocked, partial receipts and transit do not gain this exception, and Instore/extended-range lines retain their existing path. Prices and minimum order rules are unchanged. Changed prices still require review before order capture. This is a request subject to confirmation, not a paid sale or guaranteed fulfillment quantity.

The ordering policy change requires review and explicit release approval before publication or production use.

## Local verification

Node tests exercise shared availability and the actual authoritative price/stock resolver using hermetic synthetic HTTP responses, including aliases, duplicate preferences, missing markers, spoofed browser flags, missing stock, positive aggregate caps and price changes. Playwright uses only loopback Vite and intercepted synthetic auth/catalogue/basket services; unknown external requests are blocked. Desktop and mobile screenshots are produced under `test-results` for the landed search card and basket. No real customer account, basket, order, email or POS record is changed.

`site_preflight.sh` is unavailable in this checkout and searched local maintainer skill directory; branch/worktree status, refreshed production reference and repository instructions were inspected directly. The existing React `fetchpriority` console warning remains outside this change; rendered checks collect page errors.

Final checks: all 638 Node tests pass; all four desktop/mobile Playwright search and product-label checks pass; build passes; scoped lint has zero errors and one existing ProductCard effect-dependency warning; `git diff --check` passes. Independent review found no concrete P1/P2 issue and passed 10 focused server/client regression tests. Rendered checks found no horizontal overflow or page errors. The existing desktop exact-match row has poor text contrast (light text on a light background); this is recorded for review and unchanged by the availability fix. Screenshots are copied to the task's `screenshots/storefront-search-stock-available` directory for stable review.

Repeat the loopback synthetic review with `node node_modules/@playwright/test/cli.js test e2e/search-stock-available.spec.js e2e/stock-available-label.spec.js --workers=1`. The test runner starts and stops its own local Vite server. No live signed-in or hosted verification has been performed for this candidate.

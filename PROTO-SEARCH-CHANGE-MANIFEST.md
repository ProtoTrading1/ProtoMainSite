# Proto search change manifest

## Protected production baseline

- Repository: `ProtoTrading1/ProtoMainSite`
- Source commit: `7a4f87ab2a1c7139a80934be065ddbfdcee138f2`
- Source commit time: 2026-09-29 10:24 UTC
- Live `www.proto.co.za` `Last-Modified`: 2026-09-29 10:37:36 UTC
- Source/live compiled CSS: `index-CiIf4FZd.css`
- Live JavaScript: `index-C5QM5ZaW.js`
- Candidate branch: `proto/instore-search-safe-20260929`

The Vercel CLI token was not used to mutate or inspect production. The live
site, source timing and compiled CSS fingerprint establish the baseline used by
this isolated candidate. Production remains unchanged.

## Allowed change set

- `lib/instore-discovery.mjs`
- `lib/search-language.mjs`
- `api/_instore-catalogue.js`
- `src/lib/fuzzySearch.js`
- `src/components/MainContent.jsx`
- `src/index.css`
- `tests/search/fuzzySearch.test.js`
- `tests/search/search-experience.test.js`
- `tests/extended-range-api.test.js`
- `tests/instore-discovery.test.js`
- `tests/instore-catalogue-store.test.js`
- `PROTO-SEARCH-CHANGE-MANIFEST.md`

## Intended behaviour

- Keep all existing Instore eligibility gates unchanged.
- Keep stock, price, image review, duplicate suppression and explicit listing
  controls unchanged.
- Use one bounded search-language layer for both the main catalogue and
  Instore Products, covering customer synonyms, plurals and safe close typos.
- Make the complete eligible `Soft toys` range discoverable with common
  customer wording and misspellings, on both stored/server search and local
  browser search.
- Show the complete main-catalogue and Instore result totals in the site-wide
  search and make the full Instore result set an obvious action.

## Explicitly excluded

- No production deployment or alias change.
- No database migration or data write.
- No stock, checkout, price, image or listing-control change.
- No product eligibility, ordering or source-data change.

## Verification

- Live audit before the fix: `soft toys` returned all 81 eligible items, while
  `plush` returned 5, `teddy` returned 2, and `stuffed animal`, `pluch` and
  `tedi` returned none.
- Focused Instore/API tests: 45 passed.
- Expanded focused search and Instore suite: 56 passed.
- Full repository suite: 399 passed, 0 failed.
- ESLint: passed.
- Production build: passed.
- Local browser rendering was intentionally not configured with production
  Supabase credentials; authenticated visual verification remains a preview
  release gate.
- No production deployment, database or application data was changed.

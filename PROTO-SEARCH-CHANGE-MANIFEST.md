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
- `tests/instore-discovery.test.js`
- `tests/instore-catalogue-store.test.js`
- `PROTO-SEARCH-CHANGE-MANIFEST.md`

## Intended behaviour

- Keep all existing Instore eligibility gates unchanged.
- Keep stock, price, image review, duplicate suppression and explicit listing
  controls unchanged.
- Make the complete eligible `Soft toys` range discoverable with common
  customer wording and misspellings, on both stored/server search and local
  browser search.

## Explicitly excluded

- No production deployment or alias change.
- No database migration or data write.
- No stock, checkout, price, image or listing-control change.
- No main-catalogue search change.

## Verification

- Live audit before the fix: `soft toys` returned all 81 eligible items, while
  `plush` returned 5, `teddy` returned 2, and `stuffed animal`, `pluch` and
  `tedi` returned none.
- Focused Instore/API tests: 45 passed.
- Full repository suite: 397 passed across 84 test files.
- ESLint: passed.
- Production build: passed; unchanged global CSS still compiles as
  `index-CiIf4FZd.css`.
- No production deployment, database or application data was changed.

# Instore-to-Showroom gallery companion — private review

Prepared on current production base `3b3211e3c82507b3d7f151e738aec2dcad4718ed`.
Source: local `agent/instore-showroom-move` at `9febd6c`, original reader commit
`35c704bb1eb5dbc97a491bf386df7585046c17db`. The stale branch's full diff must not
be published: it predates later search changes. This isolated payload preserves
current search, floral stock refresh and all existing gallery behavior.

Only `api/products.js` and the new `lib/instore-move-galleries.mjs` alter runtime
behavior. The API selects `moved_from`, marks eligible rows, enriches both lookup
and cached/full catalogue results from the completed move proof and versions its
cache key. Only moved rows request the RPC, in batches of20 under one2sdeadline.
Proof must match the current main image;1–200HTTPS unique credential/query-free
URLs are accepted. Missing/malformed/unavailable proof retains ordinary images.
No photo uploads, price/stock changes or orderable variants are introduced.

Verification on this latest base:821Node checks pass, including11reader checks;
changed-file ESLint and production build pass. Desktop/mobile production-built
ProductCard fixtures both render all200synthetic photos, open the final photo,
and show no page errors or horizontal overflow. This is local component/browser
acceptance, not a hosted full-app pass or genuine product-photo move.

Admin base #374 (`99be5c0`) already contains duplicate-first behavior and default-off
move support. The additive SQL proposal and flags remain separate review/release
items. Isolated PostgreSQL replays captured prior contracts/ACLs, not a fresh live
schema proof. Fresh read-only deployed contract/fingerprint/privilege verification
is required before a separately approved production SQL action.

No source upload, PR, deployment, SQL/flag/access change or real move occurred.
Public upload of the named branch and generic code/test/journal payload still
needs explicit approval. Keep flags off for preview preparation; enable only in
isolated fixtures. After any completed moves, retain gallery proofs and reader on
rollback; disabling new moves must not remove existing photos or reset receipts.

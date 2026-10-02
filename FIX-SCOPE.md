# Basket sync recovery — isolated candidate

Production base checked 2026-10-02: www.proto.co.za, team_ncawrkUYi69xKqw43GlJ37WD,
project prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu, deployment dpl_AMvtzgo5rztd8Fm9BgLzQoLbmJM2,
source 5dfeb4f219bc31b5a2d4b2976a1acb7e3f4cc579 (PR259).

Allowed files: src/App.jsx, src/components/Drawer.jsx, src/lib/accountCart.js,
src/lib/accountCartRequest.mjs, tests/account-cart-recovery.test.js,
e2e/basket-sync-recovery.spec.js, FIX-SCOPE.md.

Expanded allowed scope for all-customer recovery: api/account-cart.js,
tests/account-cart-sync.test.js, e2e/basket-sync-failure-matrix.spec.js,
src/lib/cartSyncRecovery.mjs. No database records or schemas are changed.
Also allowed: src/lib/cartSyncJournal.mjs, tests/cart-sync-journal.test.js.
Also allowed: e2e/basket-pending-recovery.spec.js.
Also allowed: e2e/basket-undo-races.spec.js.

Only the allowlisted basket API validation changes; no database, service,
deployment-setting, price, stock, or customer-record changes.
Do not release without a fresh production fingerprint, preview verification and release approval.
The reported customer's exact request rejection remains unconfirmed. This patch addresses
the misleading frozen loading state, unbounded requests, and racing hydration retries;
it does not claim to repair arbitrary invalid basket data or bypass validation.

## Verification

- npm test: 472 passed, zero failures (expanded recovery candidate).
- npm run build: passed.
- ESLint: all expanded changed code and new browser tests passed.
- Expanded browser coverage includes desktop/mobile outages, a real bounded
  15-second request timeout, validation/auth rejection recovery, reload journal
  preservation, conflicts, cross-device refresh, Undo and quantity revert races.
- Independent reviewers found no remaining code blockers for isolated preview.
- Final serial combined Playwright run: 35/35 passed (desktop and mobile).
- Rejected sync retains all 15 synthetic units; no checkout while unconfirmed;
  explicit retry with a successful response restores checkout.
- Timeout, late success and original validation-error retention: tested.
- No-overwrite guard: no tracked deletions and no out-of-allowlist source changes.
- Production fingerprint rechecked after tests: same deployment and source.
- Existing React fetchpriority spelling warning observed; outside this fix scope.
- Earlier narrow fix b09954d was published to a feature branch and isolated preview.
  This expanded candidate is local only; no orders or customer records changed.

## Expanded recovery behavior

- Valid future device activity timestamps are capped at server time, without
  relaxing quantity validation or revision conflict checks.
- Pending edits are journalled by account and original revision, surviving reload.
  A divergent newer account basket blocks replacement and keeps the local draft.
- Timeout, permission, invalid basket and conflict failures have safe support codes.
- Checkout requires confirmed account sync. Unsaved edits cannot submit an order.
- Undo/revert before dispatch cancels stale operations; in-flight operations retain
  the compensating latest intent. Conflict responses cannot replace newer edits.
- A conflict intentionally requires manual review rather than silently choosing
  one device's basket. This is not a promise that external outages cannot occur.
- Rejected saves (400/401/403/413/422) stop background retries, including
  focus/online/visibility events. The existing single 401 token refresh remains.
- A three-worker combined run passed 34/35 tests; one synthetic sign-in startup
  timed out before reaching basket assertions. Its cause is not established.
  Serial verification is recorded separately; authenticated preview review
  remains required, not replaced by local fixtures.

Release requires approval to publish this branch and create an isolated preview.
The reported customer's specific 400/401 rejection still needs authenticated
request evidence; a successful synthetic retry is not proof of her recovery.

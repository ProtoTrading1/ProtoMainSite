# Basket sync recovery — isolated candidate

Production base checked 2026-10-02: www.proto.co.za, team_ncawrkUYi69xKqw43GlJ37WD,
project prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu, deployment dpl_AMvtzgo5rztd8Fm9BgLzQoLbmJM2,
source 5dfeb4f219bc31b5a2d4b2976a1acb7e3f4cc579 (PR259).

Allowed files: src/App.jsx, src/components/Drawer.jsx, src/lib/accountCart.js,
src/lib/accountCartRequest.mjs, tests/account-cart-recovery.test.js,
e2e/basket-sync-recovery.spec.js, FIX-SCOPE.md.

No backend, database, service, deployment-setting, price, stock, or customer-record changes.
Do not release without a fresh production fingerprint, preview verification and release approval.
The reported customer's exact request rejection remains unconfirmed. This patch addresses
the misleading frozen loading state, unbounded requests, and racing hydration retries;
it does not claim to repair arbitrary invalid basket data or bypass validation.

## Verification

- npm test: 464 passed, zero failures.
- npm run build: passed.
- Playwright basket recovery (desktop/mobile) and existing authenticated
  basket/cross-device regressions: 5 passed.
- Rejected sync retains all 15 synthetic units; no checkout while unconfirmed;
  explicit retry with a successful response restores checkout.
- Timeout, late success and original validation-error retention: tested.
- No-overwrite guard: no tracked deletions and no out-of-allowlist source changes.
- Production fingerprint rechecked after tests: same deployment and source.
- Existing React fetchpriority spelling warning observed; outside this fix scope.
- No order submitted, customer records changed, PR published, or deployment created.

Release requires approval to publish this branch and create an isolated preview.
The reported customer's specific 400/401 rejection still needs authenticated
request evidence; a successful synthetic retry is not proof of her recovery.

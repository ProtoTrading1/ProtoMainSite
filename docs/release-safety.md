# Automatic release safety

GitHub Actions runs the existing Node tests, the production build, and a browser smoke suite on every pull request and every push to `main`.

## Browser coverage

The Playwright suite checks the public home, sign-in validation, forgot-password feedback, standalone registration validation (including the required nature of business), policy routing, and both desktop and mobile Chromium layouts.

The public-flow suite deliberately intercepts every `/api/*` request. It cannot create a customer, submit an order, or send a reset email, and it needs no repository secrets.

The authenticated basket regression uses a fully synthetic approved customer, catalogue and in-memory account-cart service. It signs the same fake customer into isolated desktop and mobile browser contexts, proves that a stale device adopts the account basket, verifies a newer desktop edit reaches mobile, and verifies that a mobile clear cannot be resurrected by the older desktop copy. The safety guard blocks registration, reset-email, checkout and notification endpoints.

## Run locally

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Failure screenshots and retry traces are stored in `test-results/`. CI uploads the HTML report for failed runs.

## Deliberate limitations

The synthetic suite proves the browser orchestration and cross-context convergence contract, but it does not prove Vercel-to-Supabase connectivity or persistence in the deployed database. Checkout, order PDF generation and email delivery remain outside this suite.

For a real-account smoke test, use one approved non-production customer on the Vercel preview only: sign in on desktop and mobile, note the original basket, add a clearly identified test line on one device, focus the other device and confirm convergence, then restore the original basket. Do not open checkout, submit an order, request a password reset or use a production customer account. Record the preview commit, both browser versions and the final restored basket before signing out.

# Automatic release safety

GitHub Actions runs the existing Node tests, the production build, and a browser smoke suite on every pull request and every push to `main`.

## Browser coverage

The Playwright suite checks the public home, sign-in validation, forgot-password feedback, standalone registration validation (including the required nature of business), policy routing, and both desktop and mobile Chromium layouts.

The suite deliberately intercepts every `/api/*` request. It cannot create a customer, authenticate, submit an order, or send a reset email, and it needs no repository secrets.

## Run locally

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Failure screenshots and retry traces are stored in `test-results/`. CI uploads the HTML report for failed runs.

## Deliberate limitations

This public, secret-free suite does not prove authenticated catalogue, cross-device basket persistence, checkout, order PDF generation, or email delivery. Those flows need a dedicated non-production Supabase project, seeded test customer, disposable order endpoint, and mail sink before they can be exercised safely in CI.

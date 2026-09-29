# Proto search Phase 1 R&D manifest

## Status

This workspace is an isolated search R&D donor only. It is **not eligible for
production promotion** because the live custom domain moved after this branch
was created.

Production remained unchanged during this work.

## Fresh production fingerprint

- Custom domain checked: `site.proto.co.za`
- Vercel team: `team_ncawrkUYi69xKqw43GlJ37WD`
- Vercel project: `prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu` (`protoportal-main`)
- Deployment: `dpl_DWK5YbM6cdmkzGkL5GK8j6S58CTi`
- Deployment URL: `protoportal-main-elaup33xp-danieljoffeinfo-1253s-projects.vercel.app`
- Deployment source commit: `45696f8735ac9c61f6a20deabff255525002f20f`
- Source branch recorded by Vercel: `agent/checkout-cta-refinement`
- Checked: 29 September 2026, Africa/Johannesburg

## R&D donor identity

- Branch before Phase 1: `proto/instore-search-safe-20260929`
- Donor commit: `f087a29da5d26afdce1851c9ef1e5079b6c6cfdc`
- Preview audited: `protoportal-main-5yso77e5v-proto-team.vercel.app`
- Preview deployment: `dpl_AAbWkQ2NzWyM9J2Y4FjstY32eVQQ`

The donor contains Instore and other future work not present in the fresh live
deployment. It must never be used as a replacement production tree.

## Phase 1 allowed changes

- `lib/instore-discovery.mjs`
- `lib/search-language.mjs`
- `api/extended-range.js`
- `src/lib/fuzzySearch.js`
- `src/components/ExtendedRangePage.jsx`
- `src/components/InstoreProducts.css`
- `tests/extended-range-api.test.js`
- `tests/instore-browser-cache.test.js`
- `tests/instore-catalogue-store.test.js`
- `tests/instore-discovery.test.js`
- `tests/instore-search-focus.test.js`
- `tests/search/fuzzySearch.test.js`
- `PROTO-SEARCH-PHASE1-RND-MANIFEST.md`

Everything else is protected.

## Intended behaviour

- Preserve exact SKU and barcode priority.
- Preserve Instore eligibility, price, stock, image and duplicate gates.
- Normalize common measurement spacing such as `50cm`, `50 cm` and
  `50 centimetre`.
- Understand explicit price caps and availability phrases without treating
  those words as literal product-name requirements.
- Apply colour and size constraints deterministically.
- Keep soft-toy aliases out of cosmetics and non-toy plush materials.
- Make active search results denser and easier to scan on desktop and mobile.
- Improve accessible result announcements and no-results recovery.

## Verification gates

- Focused search and Instore tests.
- Correct full Windows test invocation; the package `npm test` quoted glob runs
  zero tests on this host.
- ESLint.
- Production build.
- `git diff --check`.
- New isolated preview and signed-in desktop/mobile browser verification before
  any future integration work.

## Production integration rule

Recover only this allowlisted Phase 1 patch onto a fresh tree reconstructed
from the current live deployment. Re-check the custom-domain deployment first.
If the deployment changes again, invalidate that candidate and rebuild. Never
promote this donor branch or any preview derived directly from it.

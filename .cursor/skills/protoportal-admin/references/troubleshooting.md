# Admin Troubleshooting

## Reorder Grid shows no products

1. **Check category filter** — Open Product Manager, filter same category. If products appear there but not Reorder Grid, inspect `product.category` slug vs `categoryLabel` in row data.
2. **Check env vars** — Missing `VITE_STOCK_SUPABASE_*` → red error banner or failed fetch.
3. **Check empty state** — Zero products is valid; message should say "No products in this category".
4. **Hard refresh** — Click Refresh in Reorder header to `invalidateAdminCache()` and reload.
5. **DB category text** — `website_stock.category` must match a known main category label (or slug via `matchesMainCategory`).

## Product Manager search broken

1. **Wrong page** — Search while on page 5+ should reset to page 1 immediately (sync in onChange, not separate effect).
2. **Debounce** — Results update ~300ms after typing stops.
3. **Category filter narrows set** — Search only runs within selected category when filter active.
4. **Short queries** — Single-character tokens need exact substring in code/name.
5. **Stale cache** — Hit header Refresh after external DB changes.

## Pagination scroll position

After Next/Prev, `window.scrollTo({ top: 0 })` should fire on `productPage` / `archivePage` / `customerPage` change. If not, check scroll container — admin uses document scroll, not `.adm-main`.

## Category rename doesn't save

1. **Migration 012** — Run `migrations/012_main_categories.sql` on stock Supabase.
2. **Service role key** — Admin writes need stock key with insert/update on `main_categories` and `website_stock`.
3. **Error in modal** — Red message shows Supabase error (duplicate slug, missing table, etc.).
4. **Products not updated** — `renameMainCategory` bulk-updates `website_stock.category` where label matches old name.

## New category doesn't appear

1. Confirm insert succeeded (no modal error).
2. `fetchMainCategories()` cache invalidated after create.
3. New category has empty sub-tree in `categories.json` — Product Manager subcategory dropdowns may be limited until workbook regenerate.

## Reorder order not shared

Expected behavior. Order stored in `localStorage` key `proto_sort_v1` per browser. Not written to Supabase. Customer storefront does not read this order.

## Image upload fails

Content edit and product editor upload via `api/upload-product-image.js`. Requires auth headers (`authHeaders`). Check network tab and API deployment on Vercel.

## Admin access denied

- Host must be `protoportal-admin.vercel.app` OR `VITE_ADMIN_MODE=true`
- Logged-in customer must have `role === 'admin'`
- Check `customers` row in auth Supabase

## Build / deploy checklist

```bash
npm run build
```

Env vars on Vercel admin project:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_STOCK_SUPABASE_URL`, `VITE_STOCK_SUPABASE_KEY`
- `VITE_ADMIN_MODE=true` (if not using admin subdomain)

After schema change, apply migration to stock Supabase before testing taxonomy features.

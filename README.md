# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Pricing & stock sync, and the Check Stock button

### Source of truth and sync direction

- **`public.products`** (in the *Proto Stock Tracking* Supabase project, `yiqsvwajozafvalwcero`) is the **single source of truth** for price (`sell_price`) and stock (`stock_qty`, `available_stock`). It is maintained by the Bladerunner sync and is **never written** by the website.
- **`public.website_stock`** is what the storefront actually reads (via `api/products.js` → `/products.json`). Sync direction is strictly **`products` → `website_stock`**.
- **`public.website_products`** is an empty legacy table and is **not** used by the storefront. It is intentionally left untouched.
- **Join key:** `products.sku = website_stock.barcode`. One source product maps to many `website_stock` variant rows that share a barcode (e.g. `BASHEWS` → `BASHEWS-COCOPINE`, `BASHEWS-SODA`, …); every variant inherits that product's price and stock.

The sync is a Postgres function, `public.sync_website_from_products()` (see `migrations/016_sync_website_from_products.sql`). It updates `website_stock.price`, `website_stock.stock_qty` and `website_stock.available_stock`, is idempotent (a no-change run updates 0 rows), and returns a JSON summary.

**Automatic sync (migration 017):** a row-level trigger on `public.products` runs after every insert/update of `sell_price`, `stock_qty`, or `available_stock`. When the external cron writes `products`, matching `website_stock` rows (joined on `products.sku = website_stock.barcode`) update immediately — no separate script call required.

### How to trigger a manual resync

Run after the Bladerunner sync has finished writing `public.products`:

```bash
node scripts/sync-website-from-products.mjs
```

This calls the RPC with the stock project's service-role key (`VITE_STOCK_SUPABASE_KEY`) and logs the summary, e.g.:

```json
{ "products_matched": 2875, "website_stock_updated": 4194, "unmatched_skus_count": 925, "website_products_updated": 0 }
```

You can also run it straight from the Supabase SQL editor:

```sql
select public.sync_website_from_products();
```

> **Wiring note:** the Bladerunner / pilot-correction script lives outside this repo. After it writes `public.products`, it should either run `node scripts/sync-website-from-products.mjs` or call `select public.sync_website_from_products();`.

### Caching

This is a Vite SPA, not Next.js — there is no ISR/`revalidateTag`. Catalogue price/content is served via `/api/products` (CDN `s-maxage=30`) and a 5-minute client `localStorage` cache, so synced **price** changes appear within ~30s at the edge. **Stock** is deliberately *not* baked into that cached feed: the Check Stock button hits `GET /api/stock` with `Cache-Control: no-store` so every click reads the DB fresh.

### Check Stock button

- Lives on every product card (`src/components/ProductCard.jsx`, `StockCheck`).
- On click it calls `GET /api/stock?sku=<SKU>` (the card passes its barcode), shows an inline "Checking…" spinner, then replaces the button with a readout:
  - `In stock: <qty>` when qty > `LOW_STOCK_THRESHOLD` (default `5`),
  - `Low stock: <qty> left` when 1–5,
  - `Out of stock` when 0,
  - `Could not check stock` + a Retry link on error.
- The readout persists for the page session and is announced to screen readers via `aria-live="polite"`. The row height is reserved so the card never shifts.
- `api/stock.js` validates the SKU, reads `website_stock` server-side, returns `{ sku, qty, checked_at }`, and never leaks DB errors.

### Verify all data layers agree for any SKU

Paste into the Supabase SQL editor for the stock project (replace `BASHEWS`):

```sql
select 'products'      as layer, sku                       as key, sell_price::text as price, stock_qty::text as qty
  from public.products      where sku = 'BASHEWS'
union all
select 'website_stock', barcode, price::text, stock_qty::text
  from public.website_stock where barcode = 'BASHEWS';
```

All rows should show the same `price` and `qty`. `GET /api/stock?sku=BASHEWS` should return the same `qty` (currently `1447`).

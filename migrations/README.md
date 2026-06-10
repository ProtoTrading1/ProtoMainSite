# Migrations ledger

Two Supabase projects are in play:

- **portal** (`VITE_SUPABASE_*`) — auth, customers, orders.
- **stock** (`VITE_STOCK_SUPABASE_*`, ref `yiqsvwajozafvalwcero`) — the product catalogue.

Apply each file in the SQL editor of the project noted in its header. Files are kept
for replay history; superseded ones are **not deleted** so the history stays intact.

## Portal project

| File | Purpose |
| --- | --- |
| `001_initial.sql` | Initial portal schema |
| `002_portal_hardening.sql` | Portal hardening |
| `003_admin_workflows.sql` | Admin workflow tables/policies |
| `004_trade_request_fields.sql` | Trade-request application fields |
| `005_whatsapp_sessions.sql` | WhatsApp session tracking |
| `006_accept_whatsapp.sql` | WhatsApp opt-in acceptance |
| `007_whatsapp_opt_in_at.sql` | WhatsApp opt-in timestamp |

## Stock project (catalogue)

| File | Status | Purpose |
| --- | --- | --- |
| `007_stock_subcategory.sql` | **superseded by 010** | Added `subcategory` column to the old `website_products` table |
| `009_leaf_category.sql` | **superseded by 010** | Added `leaf_category` column to the old `website_products` table |
| `010_website_stock.sql` | **current** | Forward state. Creates `website_stock` + `archived_products`, indexes, RLS, and the transactional `archive_product` / `unarchive_product` functions. Supersedes `website_products` / `products` (wiped after a verified backup). |

### Catalogue rebuild (010) — operational notes

The catalogue was rebuilt from `Categorised_Product_Master.xlsx`:

1. `scripts/backup-stock-tables.mjs` — backs up `website_products` + `products` to
   `migration-backup/` and gates the wipe on `backup row count == live count`.
2. Apply `010_website_stock.sql`, then wipe the old tables (after the FK pre-check).
3. `scripts/import-website-stock.mjs` — imports the 5,242 rows into `website_stock`.
4. `scripts/migrate-product-images.mjs` — rehosts images to the `product-images` bucket
   (resumable + content-validated).
5. `scripts/generate-categories.mjs` — regenerates `src/data/categories.json`.

The catalogue is **catalogue-only** — no price or stock columns.

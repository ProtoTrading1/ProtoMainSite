# Admin Data Model

## Dual Supabase

| Project | Env vars | Tables used by admin |
|---------|----------|---------------------|
| Auth | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `customers`, `orders` |
| Stock | `VITE_STOCK_SUPABASE_URL`, `VITE_STOCK_SUPABASE_KEY` | `website_stock`, `archived_products`, `main_categories` |

Client: `src/lib/supabase.js` (auth), `src/lib/supabaseStock.js` (stock).

## website_stock (live catalogue)

| Column | Notes |
|--------|-------|
| `sku` | Primary key; product id in app |
| `barcode` | Customer-facing product code |
| `title` | Display name |
| `original_description` | Description text |
| `image_url_one` … `image_url_four` | Image URLs |
| `category` | **Human label** e.g. "Hardware" — not slug |
| `subcategory_one` … `subcategory_four` | Human labels, hierarchical |
| `created_at`, `updated_at` | Timestamps |

No `price`, `stock`, or `sort_order` columns — catalogue-only mode.

## archived_products

Same product columns plus `archived_at`, `archived_by`. Populated by `archive_product()` RPC (atomic move from `website_stock`).

## main_categories

| Column | Notes |
|--------|-------|
| `id` | Slug PK e.g. `hardware` |
| `label` | Display name |
| `icon` | Lucide icon key string |
| `sort_order` | Dropdown order |

Seeded from `categories.json` top-level nodes. Admin can rename (updates products) or add new rows.

## Product adapt shape (in-memory)

After `adapt(row)` in `products.js`:

```javascript
{
  id: row.sku,           // same as sku
  code: row.barcode,
  barcode: row.barcode,
  websiteSku: row.sku,
  name: row.title,
  category: labelToSlug(row.category),  // slug for filtering
  categoryLabel: row.category,          // raw DB label
  subcategoryLabels: [sub1, sub2, ...].filter(Boolean),
  image, images, description, ...
  price: 0, stockQty: 0,  // safe defaults
  isArchived: false,
}
```

## Category matching

`matchesMainCategory(product, slugOrAll)` in `products.js` returns true when:

- Filter is `'all'` or empty
- `product.category === slug`
- `product.categoryLabel === slug` (legacy)
- `product.categoryLabel === slugToLabel(slug)`
- `labelToSlug(product.categoryLabel) === slug`

This keeps Product Manager and Reorder Grid consistent when DB labels drift from JSON slugs.

## Taxonomy slug rules

`labelToSlug()` in `taxonomy.js` must match `scripts/lib/master.mjs`. Lowercase, non-alphanumeric → hyphen, trim edges.

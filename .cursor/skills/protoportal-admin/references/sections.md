# Admin Sections — Deep Dive

All sections live in `src/pages/AdminPage.jsx`. Switch via `activeSection` state and sidebar buttons.

## Product Manager (`products`)

**Load path:**
```
loadProducts()
  → fetchAdminProductsPage({ page, pageSize: 50, searchQuery, categoryFilter, onProgress })
    → getAllCachedAdmin() or loadArchivedFromDB()
    → matchesMainCategory() if category filter
    → fuzzyFilter() if search
    → sort by categoryLabel, name
    → slice for page
```

**Writes:**
- `saveProduct()` → `createProduct` / `updateProduct`
- `toggleArchive()` → `archiveProduct` / `unarchiveProduct`
- `toggleSpecial()` → `saveSpecials`
- `exportLiveXlsx()` → full catalogue export

**UI:** List grouped by category header within page. Editor modal for full product fields. Subcategory dropdowns from `categories.json` tree via `childrenAt()`.

## Reorder Grid (`reorder`)

**Load path:**
```
loadCategoryWorkingSet(categoryId, 'reorder')
  → fetchProductsByMainCategory(categoryId, { onProgress })
  → applySavedOrder(rows, categoryId)  // localStorage proto_sort_v1
  → setReorderProducts
```

**Interactions:**
- Drag-and-drop reorder → `saveCategoryOrder()` to localStorage
- Checkbox multi-select → move to top
- Image icon → content edit modal (image + description only)
- Manage categories → taxonomy modal (`taxonomyAdmin.js`)

**Not supported here:** product rename, subcategory edit, server-persisted sort order.

## Archive (`archive`)

Same list/pager pattern as Product Manager with `archived: true`. Unarchive restores via RPC. Export Excel available.

## This Week's Specials (`specials`)

Products starred in Product Manager. Each special has deal type: none, discount %, or BOGO. Saved to specials API (`src/lib/specials.js`). Max 10 items.

## Customer Management (`customers`)

**Tabs:** `requests` (unapproved), `regular`, `premium`

```
loadCustomers()
  → fetchCustomersPage({ page, pageSize: 50, tab, searchQuery })
```

Trade requests expand to drawer with approve/delete actions. Tier changes via `updateCustomerAdmin`.

## Order Requests (`orders`)

```
loadOrders() → fetchAllOrdersAdmin(150)
```

Client-side filter by order number, customer name/email, items. Status dropdown updates via `updateOrderAdmin`. CSV export via `csvDownload()`.

## Shared UI primitives

- `Pager` — prev/next, hidden when single page; parent scrolls window to top on page change
- `AdminField` — labeled form grid cell
- `AdminStat` — header stats bar
- Progress: `loadingProgress` 0–100 for catalogue fetches; `loading` spinner for lighter loads

## Refresh button (header)

`refreshCurrentSection()` invalidates admin cache for products/archive, then reloads active section.

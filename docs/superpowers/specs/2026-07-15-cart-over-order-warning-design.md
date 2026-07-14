# Cart over-order warning — design

**Date:** 2026-07-15
**Repo:** Proto-Website- (main portal / site.proto.co.za)
**Status:** Approved

## Problem

Customers can enter a quantity larger than what is in stock. The product-card
quantity input is hardcoded `max="9999"` and is unaware of stock, so a customer
types e.g. 100 with 10 in stock. Today the cart *silently* clamps the line to
the available 10 (`cartQtyCapForProduct` in `App.jsx`), with no feedback — the
customer asked for 100 and got 10 with no explanation. That silent reduction is
the frustration.

## Decision

**Allow over-ordering, but warn clearly.** The flow is a wholesale *quote
request* the team confirms, so ordering more than current stock is a legitimate
backorder request. We stop the silent clamp and instead show a clear,
customer-facing warning wherever the requested quantity exceeds available stock.
Scope is the main portal only — no API/schema or admin-email changes.

## Rules preserved

- **`to_order` products** — orderable at any quantity, even at 0 stock. No warning.
- **Negative stock-on-hand (backorder)** — orderable, no warning.
- **Unknown stock** (`stockOnHand`/`stockQty` null) — no warning, no cap (as today).
- **Zero-stock, non-`to_order`** — remains non-orderable (Add disabled). Unchanged.
- **Low-stock badge** (≤5) — separate, unchanged.

## Components

1. **`src/lib/stockAdvisory.js`** (new) — pure helper.
   `stockAdvisoryForQty(product, qty) -> { availableStock, isOverOrder, shortfall }`.
   `isOverOrder` is true only when stock is a known number `> 0`, the product is
   not `to_order`/backorder, and `qty > availableStock`. `shortfall = qty - availableStock`.
   Mirrors the availability/orderability semantics already in
   `src/lib/products.js` (`isOrderableWhenOutOfStock`) and `App.jsx`
   (`productStockQtyForCart`, `productCanOrderWhenOos`).

2. **`src/App.jsx` `cartQtyCapForProduct`** — change from "cap at stock" to:
   `0` if unorderable (zero-stock non-`to_order`), otherwise `CART_QTY_UNLIMITED`
   (9999). Removes the silent clamp so the customer's number persists. Ordering
   of out-of-stock non-`to_order` items stays blocked (cap 0).

3. **`src/components/ProductCard.jsx` `ProductQtyInput`** — accept the selected
   variant's stock; render an inline advisory under the qty box when over-ordering:
   *"Only {n} in stock — we'll confirm the extra {shortfall} with you."*
   Variant-aware (uses the selected variant's stock).

4. **`src/components/Drawer.jsx` `QuantityInput`** — align max with the new allow
   behavior (no silent stock clamp) and render a compact per-line note on
   over-ordered lines: *"{n} in stock · {shortfall} to confirm."*

5. **`scripts/qa-smoke-check.mjs`** — assertions that `stockAdvisory` exists and
   that the qty input is stock-aware (no longer stock-blind `max="9999"` only).

## Data flow

`stockOnHand` (from `available_stock ?? stock_qty`) and `toOrder` are already on
every product object returned by `api/products.js`. The advisory is computed
client-side from that cached feed (CDN `s-maxage=30` + client cache) — no new
API calls. The existing "Check Stock" button remains the on-demand live source
of truth.

## Copy (tweakable)

- Product card: `Only {n} in stock — we'll confirm the extra {shortfall} with you.`
- Cart line: `{n} in stock · {shortfall} to confirm.`

## Testing / verification

- `qa-smoke-check.mjs` assertions (above).
- `vite build` compiles; `eslint` clean on touched files.
- Manual: type qty > stock on an in-stock product → warning shows, cart keeps the
  requested number; `to_order` item → no warning; out-of-stock non-`to_order` →
  Add still disabled.

## Out of scope

- Flagging over-ordered lines in the team's order email/PDF (declined — admin repo).
- Live per-keystroke stock validation (the Check Stock button already gives live truth).

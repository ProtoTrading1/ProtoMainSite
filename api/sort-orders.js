import { getPortalAdminClient, readSiteConfigJson } from './_site-config.js';

const SORT_FILE = 'sort-orders/orders.json';

/** Public read of category product sort orders (written by admin portal). */
export function createSortOrdersHandler({ readStore = readSiteConfigJson, getClient = getPortalAdminClient } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const store = await readStore(SORT_FILE, { orders: {}, updatedAt: null });
      const result = { ...store, orders: { ...(store?.orders || {}) } };
      // Only Just Added moves to the atomic portal row. Never reuse its legacy
      // Storage value when the row is absent or unavailable.
      let entry = { skuOrder: [], updatedAt: null, unavailable: true };
      try {
        const { data: atomic, error } = await getClient()
          .from('just_added_order_state').select('sku_order,updated_at').eq('id', true).maybeSingle();
        const valid = !error && atomic && Array.isArray(atomic.sku_order)
          && atomic.sku_order.every((sku) => typeof sku === 'string' && sku && sku === sku.trim())
          && new Set(atomic.sku_order).size === atomic.sku_order.length
          && (atomic.updated_at === null || typeof atomic.updated_at === 'string' && atomic.updated_at);
        if (valid) entry = { skuOrder: atomic.sku_order, updatedAt: atomic.updated_at };
      } catch {
        // A Just Added outage must not discard unrelated category orders.
      }
      result.orders['collection:just-added'] = entry;
      return res.status(200).json(result);
    } catch (err) {
      console.error('sort-orders api error:', err);
      return res.status(500).json({ error: err.message || 'Failed to load sort orders' });
    }
  };
}

export default createSortOrdersHandler();

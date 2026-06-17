import { readSiteConfigJson } from './_site-config.js';

const SORT_FILE = 'sort-orders/orders.json';

/** Public read of category product sort orders (written by admin portal). */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const store = await readSiteConfigJson(SORT_FILE, { orders: {}, updatedAt: null });
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=30');
    return res.status(200).json(store);
  } catch (err) {
    console.error('sort-orders api error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load sort orders' });
  }
}

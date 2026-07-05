import { readSiteConfigJson } from './_site-config.js';

const FEATURED_FILE = 'featured-products.json';

/** Public read of admin-curated home featured list. */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const parsed = await readSiteConfigJson(FEATURED_FILE, { items: [], updatedAt: null });
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      updatedAt: parsed?.updatedAt || null,
    });
  } catch {
    return res.status(200).json({ items: [], updatedAt: null });
  }
}

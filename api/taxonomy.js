import { readFileSync } from 'fs';
import { join } from 'path';
import { readSiteConfigJson } from './_site-config.js';
import { injectMotarroIntoTree } from './_mottaro-category.js';

const TAXONOMY_FILE = 'taxonomy/categories.json';
const BUNDLED_PATH = join(process.cwd(), 'src/data/categories.json');

function loadBundled() {
  try {
    return JSON.parse(readFileSync(BUNDLED_PATH, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Public taxonomy endpoint.
 *
 * The admin app writes the live category tree to Supabase Storage
 * (`site-config/taxonomy/categories.json`). The customer-facing portal
 * needs the *same* tree so renames and new subcategories appear without
 * a re-deploy of the bundled `src/data/categories.json` snapshot.
 *
 * Strategy:
 *  1. Try the live taxonomy in Supabase Storage (read-only via service key).
 *  2. Fall back to the bundled JSON file shipped with the build.
 *
 * We deliberately allow a short edge cache so heavy traffic doesn't hit
 * Storage on every request, but `stale-while-revalidate` keeps changes
 * propagating in seconds.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let categories = null;
    try {
      const stored = await readSiteConfigJson(TAXONOMY_FILE, null);
      if (Array.isArray(stored)) categories = stored;
      else if (stored?.categories && Array.isArray(stored.categories)) categories = stored.categories;
    } catch {
      // Storage not configured / unreachable — fall through to bundled.
    }

    if (!categories || !categories.length) categories = loadBundled();

    categories = injectMotarroIntoTree(categories);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ categories });
  } catch (err) {
    console.error('taxonomy api error:', err);
    return res.status(200).json({ categories: loadBundled() });
  }
}

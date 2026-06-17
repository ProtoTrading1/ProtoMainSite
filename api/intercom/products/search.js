import { createClient } from '@supabase/supabase-js';
import { requireIntercomSecret } from '../_auth.js';

const MAX_RESULTS = 25;
const SELECT_COLS = 'sku, barcode, title, category, subcategory_one, subcategory_two, price, image_url_one, available_stock, stock_qty, keep_live_when_oos';

function getStockClient() {
  const url = process.env.VITE_STOCK_SUPABASE_URL;
  const key = process.env.VITE_STOCK_SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing VITE_STOCK_SUPABASE_URL or VITE_STOCK_SUPABASE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function escapeIlike(raw) {
  return String(raw || '').trim().replace(/[%_\\]/g, '\\$&');
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `R${n.toFixed(2)}`;
}

function stockQty(row) {
  const avail = Number(row.available_stock);
  const raw = Number(row.stock_qty);
  if (Number.isFinite(avail)) return avail;
  if (Number.isFinite(raw)) return raw;
  return 0;
}

function availabilityLabel(row, { archived = false } = {}) {
  if (archived) return 'Archived';
  const qty = stockQty(row);
  if (qty > 0) return 'In stock';
  if (row.keep_live_when_oos) return 'Available to order (zero stock)';
  return 'Out of stock';
}

function toProduct(row, { archived = false } = {}) {
  return {
    name: row.title || '',
    sku: row.sku || '',
    barcode: row.barcode || '',
    category: row.category || '',
    subcategory: row.subcategory_one || '',
    subcategory_two: row.subcategory_two || '',
    availability: availabilityLabel(row, { archived }),
    case_size: '',
    price: formatPrice(row.price),
    image_url: row.image_url_one || null,
    stock_qty: stockQty(row),
  };
}

function ilikePattern(raw) {
  const term = escapeIlike(raw);
  if (!term) return null;
  return `%${term}%`;
}

function applyTextFilter(query, q) {
  const pattern = ilikePattern(q);
  if (!pattern) return query;
  return query.or(
    `title.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern},category.ilike.${pattern},subcategory_one.ilike.${pattern},subcategory_two.ilike.${pattern}`,
  );
}

function applyFieldFilters(query, { sku, category, subcategory }) {
  let next = query;
  const skuTerm = String(sku || '').trim();
  if (skuTerm) {
    next = next.or(`sku.eq.${skuTerm},barcode.eq.${skuTerm},sku.ilike.${ilikePattern(skuTerm)},barcode.ilike.${ilikePattern(skuTerm)}`);
  }
  const catPattern = ilikePattern(category);
  if (catPattern) next = next.ilike('category', catPattern);
  const subPattern = ilikePattern(subcategory);
  if (subPattern) {
    next = next.or(`subcategory_one.ilike.${subPattern},subcategory_two.ilike.${subPattern}`);
  }
  return next;
}

async function searchTable(supabase, table, filters) {
  let query = supabase.from(table).select(SELECT_COLS).limit(MAX_RESULTS);
  if (filters.q) query = applyTextFilter(query, filters.q);
  query = applyFieldFilters(query, filters);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Intercom validates connector URLs with GET/HEAD on save.
  if (req.method === 'HEAD') return res.status(200).end();
  if (req.method === 'GET' && !req.query?.q && !req.query?.sku && !req.query?.category && !req.query?.subcategory) {
    return res.status(200).json({ ok: true, service: 'intercom-product-search' });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!requireIntercomSecret(req, res)) return;

  const q = String(req.query.q || '').trim();
  const sku = String(req.query.sku || '').trim();
  const category = String(req.query.category || '').trim();
  const subcategory = String(req.query.subcategory || '').trim();
  const includeArchived = ['1', 'true', 'yes'].includes(String(req.query.include_archived || '').toLowerCase());

  if (!q && !sku && !category && !subcategory) {
    return res.status(400).json({ error: 'Provide at least one of: q, sku, category, subcategory' });
  }

  try {
    const supabase = getStockClient();
    const filters = { q, sku, category, subcategory };

    const liveRows = await searchTable(supabase, 'website_stock', filters);
    let products = liveRows.map((row) => toProduct(row));

    if (includeArchived) {
      const archivedRows = await searchTable(supabase, 'archived_products', filters);
      const liveSkus = new Set(products.map((p) => p.sku));
      for (const row of archivedRows) {
        if (liveSkus.has(row.sku)) continue;
        products.push(toProduct(row, { archived: true }));
      }
    }

    products = products.slice(0, MAX_RESULTS);

    return res.status(200).json({ products, count: products.length });
  } catch (err) {
    console.error('intercom product search error:', err?.message || err);
    return res.status(500).json({ error: 'Product search failed' });
  }
}

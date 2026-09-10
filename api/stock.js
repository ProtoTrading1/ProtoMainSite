import { createClient } from '@supabase/supabase-js';
import { getApprovedCustomer, requireAuth } from './_auth.js';
import { availabilityForRow, loadIncomingAvailability } from './_product-availability.js';

// Live, on-demand stock lookup for the customer-facing "Check Stock" button.
// Always hits the DB fresh (no-store) so a click never serves a cached number.
//
// Stock is tracked at the source-product level: products.sku = website_stock.barcode.
// One barcode maps to several variant rows that share the same stock, so we match
// on barcode first (the value shown on the card as product.code), then fall back to
// the website sku. Reads website_stock, which carries stock_qty synced from
// public.products via sync_website_from_products().

// Accept uppercase letters, digits and dashes (real SKUs/barcodes), sane max length.
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{0,63}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sku = String(req.query.sku || '').trim().toUpperCase();
  if (!sku || !SKU_RE.test(sku)) {
    return res.status(400).json({ error: 'Invalid or missing sku' });
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const supabase = createClient(
      process.env.VITE_STOCK_SUPABASE_URL,
      process.env.VITE_STOCK_SUPABASE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Authentication must complete first, but the independent approval and
    // stock reads can run together. This removes one full database round trip
    // from every live stock check without caching or weakening either rule.
    const [access, stockResult] = await Promise.all([
      getApprovedCustomer(user, res),
      supabase
        .from('website_stock')
        .select('sku, barcode, stock_qty, available_stock, keep_live_when_oos, to_order')
        .or(`barcode.eq.${sku},sku.eq.${sku}`)
        .limit(1),
    ]);
    if (!access) return;

    const { data, error } = stockResult;

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'SKU not found' });
    }

    const row = data[0];
    // available_stock is SOH (what Bladerunner/cron writes); stock_qty is the raw figure.
    const avail = Number(row.available_stock);
    const raw = Number(row.stock_qty);
    const qty = Number.isFinite(avail) ? avail : (Number.isFinite(raw) ? raw : 0);
    const incoming = await loadIncomingAvailability(supabase, row.sku);
    const availability = availabilityForRow(row, incoming);
    return res.status(200).json({
      sku,
      qty,
      keep_live_when_oos: !!row.keep_live_when_oos,
      to_order: !!row.to_order,
      available_stock: Number.isFinite(avail) ? avail : null,
      stock_qty: Number.isFinite(raw) ? raw : null,
      availability,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('stock api error:', err?.message || err);
    return res.status(502).json({ error: 'Stock lookup failed' });
  }
}

import { normalizeIncomingAvailability, resolveProductAvailability } from '../lib/product-availability.mjs';

export function availabilityTableMissing(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return /PGRST202|PGRST205|42P01|42883|get_website_product_availability/i.test(text);
}

export async function loadIncomingAvailabilityMap(supabase, skus = null) {
  const requested = Array.isArray(skus) && skus.length ? [...new Set(skus)] : null;
  const { data, error } = await supabase.rpc('get_website_product_availability', { p_skus: requested });
  if (error && availabilityTableMissing(error)) return new Map();
  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.sku || '').trim(), normalizeIncomingAvailability(row)]));
}

export async function loadIncomingAvailabilityVersion(supabase) {
  const { data, error } = await supabase.rpc('get_website_product_availability_version');
  if (error && availabilityTableMissing(error)) return { newest: '0', count: 0 };
  if (error) throw error;
  const row = data?.[0] || {};
  return { newest: row.newest_updated_at || '0', count: Number(row.row_count) || 0 };
}

export async function loadIncomingAvailability(supabase, sku) {
  const map = await loadIncomingAvailabilityMap(supabase, [sku]);
  return map.get(String(sku || '').trim()) || normalizeIncomingAvailability();
}

export function availabilityForRow(row, incoming = null) {
  const raw = row?.available_stock ?? row?.stock_qty;
  const stockQty = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  return resolveProductAvailability({
    stockQty: Number.isFinite(stockQty) ? stockQty : null,
    toOrder: !!row?.to_order,
    incoming,
  });
}

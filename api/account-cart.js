import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';

const MAX_LINES = 250;
const MAX_QTY = 9999;

function serviceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function itemKey(item) {
  return String(item?.product?.id || item?.product?.sku || item?.product?.code || '').trim();
}

function cleanText(value, max = 500) {
  return String(value ?? '').slice(0, max);
}

function sanitizeProduct(product) {
  const source = product && typeof product === 'object' ? product : {};
  return {
    id: cleanText(source.id || source.sku || source.code, 160),
    sku: cleanText(source.sku || source.id || source.code, 160),
    code: cleanText(source.code || source.sku || source.id, 160),
    name: cleanText(source.name, 500),
    price: Number.isFinite(Number(source.price)) ? Number(source.price) : 0,
    image: cleanText(source.image, 1500),
    localImage: cleanText(source.localImage, 1500),
    barcode: cleanText(source.barcode, 160),
    stockOnHand: Number.isFinite(Number(source.stockOnHand)) ? Number(source.stockOnHand) : null,
    stockQty: Number.isFinite(Number(source.stockQty)) ? Number(source.stockQty) : null,
    inStock: source.inStock !== false,
    toOrder: source.toOrder === true,
    to_order: source.to_order === true,
  };
}

function sanitizeItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of value) {
    const key = itemKey(raw);
    const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(raw?.qty) || 1)));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ product: sanitizeProduct(raw.product), qty });
    if (result.length >= MAX_LINES) break;
  }
  return result;
}

function normalizeActivityAt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}

function mergeItems(remoteItems, localItems, remoteActivityAt, localActivityAt) {
  const remote = sanitizeItems(remoteItems);
  const local = sanitizeItems(localItems);
  const localIsNewer = (localActivityAt || 0) >= (remoteActivityAt || 0);
  const first = localIsNewer ? remote : local;
  const second = localIsNewer ? local : remote;
  const merged = new Map(first.map((item) => [itemKey(item), item]));
  for (const item of second) merged.set(itemKey(item), item);
  return [...merged.values()].slice(0, MAX_LINES);
}

function payload(row) {
  return {
    items: sanitizeItems(row?.items),
    activityAt: normalizeActivityAt(row?.activity_at),
    revision: Number(row?.revision || 0),
  };
}

export default async function handler(req, res) {
  const approved = await requireApprovedCustomer(req, res);
  if (!approved) return;
  const customerId = approved.user.id;
  const supabase = serviceClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('customer_account_carts')
      .select('items, activity_at, revision').eq('customer_id', customerId).maybeSingle();
    if (error) return res.status(500).json({ error: 'Account basket could not be loaded' });
    return res.status(200).json(payload(data));
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('customer_account_carts').delete().eq('customer_id', customerId);
    if (error) return res.status(500).json({ error: 'Account basket could not be cleared' });
    return res.status(200).json({ items: [], activityAt: null, revision: 0 });
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const incomingItems = sanitizeItems(req.body?.items);
  const incomingActivityAt = normalizeActivityAt(req.body?.activityAt);
  const { data: current, error: readError } = await supabase.from('customer_account_carts')
    .select('items, activity_at, revision').eq('customer_id', customerId).maybeSingle();
  if (readError) return res.status(500).json({ error: 'Account basket could not be loaded' });

  const currentRevision = Number(current?.revision || 0);
  if (req.body?.mode !== 'merge' && Number(req.body?.revision || 0) !== currentRevision) {
    return res.status(409).json({ error: 'A newer account basket is available', ...payload(current) });
  }

  const currentActivityAt = normalizeActivityAt(current?.activity_at);
  const items = req.body?.mode === 'merge'
    ? mergeItems(current?.items, incomingItems, currentActivityAt, incomingActivityAt)
    : incomingItems;
  const activityAt = Math.max(currentActivityAt || 0, incomingActivityAt || 0) || null;
  const revision = currentRevision + 1;
  const { data, error } = await supabase.from('customer_account_carts').upsert({
    customer_id: customerId,
    items,
    activity_at: activityAt,
    revision,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'customer_id' }).select('items, activity_at, revision').single();
  if (error) return res.status(500).json({ error: 'Account basket could not be saved' });
  return res.status(200).json(payload(data));
}

import { supabase } from './supabase';

/** Idempotency key for one checkout attempt (crypto.randomUUID with fallback). */
export function makeClientRef() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isMissingClientRefColumn(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST204' || error?.code === '42703'
    ? msg.includes('client_ref')
    : /client_ref/.test(msg) && /column|schema/i.test(msg);
}

function isUniqueViolation(error) {
  return error?.code === '23505' || /duplicate key/i.test(String(error?.message || ''));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function insertOrderWithRetry(insertRow, clientRef) {
  let row = { ...insertRow, ...(clientRef ? { client_ref: clientRef } : {}) };
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(attempt === 1 ? 500 : 1500);
    const { data, error } = await supabase.from('orders').insert([row]).select().single();
    if (!error) return data;
    lastError = error;
    // Migration 030 not applied yet — drop the key and continue (same
    // duplicate-protection as before the column existed, i.e. none).
    if (isMissingClientRefColumn(error)) {
      const withoutRef = { ...row };
      delete withoutRef.client_ref;
      row = withoutRef;
      continue;
    }
    // A previous attempt actually landed — recover the existing row instead of
    // double-inserting the same checkout.
    if (clientRef && isUniqueViolation(error)) {
      const { data: existing } = await supabase
        .from('orders')
        .select('*')
        .eq('client_ref', clientRef)
        .maybeSingle();
      if (existing) return existing;
    }
  }
  throw lastError;
}

export async function saveOrder(customerId, cartItems, totalExVat, {
  deliveryMethod = null,
  customerNotes = '',
  promoCode = null,
  discountPct = null,
  discountAmount = null,
  clientRef = null,
} = {}) {
  const items = cartItems.map((i) => ({
    productId: i.product.id,
    code: i.product.code,
    name: i.product.name,
    qty: i.qty,
    unitPrice: i.product.price,
    lineTotal: i.product.price * i.qty,
    image: i.product.image || '',
  }));

  const notes = String(customerNotes || '').trim();
  const code = String(promoCode || '').trim().toUpperCase() || null;
  const insertRow = {
    customer_id: customerId,
    items,
    original_items: items,
    final_items: items,
    order_match: 'order-match',
    total_ex_vat: totalExVat,
    ...(deliveryMethod ? { delivery_method: deliveryMethod } : {}),
    ...(notes ? { customer_notes: notes } : {}),
    ...(code ? { promo_code: code } : {}),
    ...(discountPct != null ? { discount_pct: discountPct } : {}),
    ...(discountAmount != null ? { discount_amount: discountAmount } : {}),
  };

  const data = await insertOrderWithRetry(insertRow, clientRef);

  // Fallback update if insert didn't persist delivery/notes (older schema or RLS).
  if (data?.id && (deliveryMethod || notes)) {
    const patch = {};
    if (deliveryMethod) patch.delivery_method = deliveryMethod;
    if (notes) patch.customer_notes = notes;
    const { error: patchErr } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', data.id);
    if (patchErr) console.warn('order delivery/notes not saved:', patchErr.message);
  }

  // Premium tier qualification is decided server-side in /api/send-order.
  return data;
}

export async function fetchOrderHistory(customerId, limit = 10) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchLastOrder(customerId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

import { supabase } from './supabase';

export async function saveOrder(customerId, cartItems, totalExVat, {
  deliveryMethod = null,
  customerNotes = '',
  promoCode = null,
  discountPct = null,
  discountAmount = null,
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

  const { data, error } = await supabase
    .from('orders')
    .insert([insertRow])
    .select()
    .single();
  if (error) throw error;

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

import { supabase } from './supabase';

export async function saveOrder(customerId, cartItems, totalExVat, deliveryMethod = null) {
  const items = cartItems.map((i) => ({
    productId: i.product.id,
    code: i.product.code,
    name: i.product.name,
    qty: i.qty,
    unitPrice: i.product.price,
    lineTotal: i.product.price * i.qty,
    image: i.product.image || '',
  }));

  const { data, error } = await supabase
    .from('orders')
    .insert([{
      customer_id: customerId,
      items,
      original_items: items,
      final_items: items,
      order_match: 'order-match',
      total_ex_vat: totalExVat,
    }])
    .select()
    .single();
  if (error) throw error;

  // Persist the customer's chosen delivery method so it shows on the order link.
  // Done as a separate update so a missing column (migration 024 not yet run)
  // can never break order creation — it just logs and moves on.
  if (deliveryMethod && data?.id) {
    const { error: dmErr } = await supabase
      .from('orders')
      .update({ delivery_method: deliveryMethod })
      .eq('id', data.id);
    if (dmErr) console.warn('delivery_method not saved (run migration 024):', dmErr.message);
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

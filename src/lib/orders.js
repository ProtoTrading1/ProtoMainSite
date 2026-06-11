import { supabase } from './supabase';

function buildOrderNumber() {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PT-${date}-${suffix}`;
}

export async function saveOrder(customerId, cartItems, totalExVat) {
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
      order_number: buildOrderNumber(),
      total_ex_vat: totalExVat,
    }])
    .select()
    .single();
  if (error) throw error;

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

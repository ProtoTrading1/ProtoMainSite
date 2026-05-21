import { supabase } from './supabase';

const PAGE_SIZE = 1000;

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

  const qualifiesForPremium =
    totalExVat > 4000 &&
    cartItems.some((i) => i.qty > 10);

  if (qualifiesForPremium) {
    await supabase
      .from('customers')
      .update({ tier: 'premium' })
      .eq('id', customerId)
      .eq('tier', 'regular');
  }

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

export async function fetchAllOrdersAdmin(limit = 150) {
  const res = await fetch(`/api/admin-orders?limit=${limit}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to fetch orders');
  return json.rows || [];
}

export async function updateOrderAdmin(id, fields) {
  const res = await fetch('/api/admin-orders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...fields }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update order');
  return json.row;
}

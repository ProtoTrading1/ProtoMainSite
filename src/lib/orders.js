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

export async function fetchAllOrdersAdmin(limit = 100) {
  if (limit && limit <= PAGE_SIZE) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(name, email, tier)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(name, email, tier)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE || (limit && rows.length >= limit)) break;
    from += PAGE_SIZE;
  }

  return limit ? rows.slice(0, limit) : rows;
}

export async function updateOrderAdmin(id, fields) {
  const patch = { ...fields };
  if (patch.status === 'viewed' && !patch.viewed_at) patch.viewed_at = new Date().toISOString();
  if (patch.status === 'paid' && !patch.paid_at) patch.paid_at = new Date().toISOString();
  if (patch.status === 'delivered' && !patch.delivered_at) patch.delivered_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .select('*, customers(name, email, tier)')
    .single();
  if (error) throw error;
  return data;
}

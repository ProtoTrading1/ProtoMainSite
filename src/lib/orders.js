import { supabase } from './supabase';

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
    .insert([{ customer_id: customerId, items, total_ex_vat: totalExVat }])
    .select()
    .single();
  if (error) throw error;

  // Auto-promote to premium if order total > R4,000 and any single item qty > 10
  const qualifiesForPremium =
    totalExVat > 4000 &&
    cartItems.some((i) => i.qty > 10);

  if (qualifiesForPremium) {
    await supabase
      .from('customers')
      .update({ tier: 'premium' })
      .eq('id', customerId)
      .eq('tier', 'regular'); // only upgrade, never downgrade
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
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(name, email, tier)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

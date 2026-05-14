import { supabase } from './supabase';

const PAGE_SIZE = 1000;

export async function updateProfile(id, fields) {
  const { data, error } = await supabase
    .from('customers')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAllCustomers() {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function fetchCustomersPage({ page = 1, pageSize = 50, tab = 'regular', searchQuery = '' } = {}) {
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (tab === 'premium') {
    query = query.eq('tier', 'premium').eq('is_approved', true);
  } else if (tab === 'requests') {
    query = query.eq('is_approved', false);
  } else {
    query = query.neq('tier', 'premium').eq('is_approved', true);
  }

  const q = searchQuery.trim();
  if (q) {
    const safe = q.replace(/[%',()]/g, ' ').trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = data || [];
  const ids = rows.map((row) => row.id).filter(Boolean);
  const orderCounts = {};

  if (ids.length) {
    let offset = 0;
    while (true) {
      const { data: orderRows, error: orderError } = await supabase
        .from('orders')
        .select('customer_id')
        .in('customer_id', ids)
        .range(offset, offset + PAGE_SIZE - 1);
      if (orderError) throw orderError;
      const batch = orderRows || [];
      batch.forEach((row) => {
        if (!row.customer_id) return;
        orderCounts[row.customer_id] = (orderCounts[row.customer_id] || 0) + 1;
      });
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return {
    rows: rows.map((row) => ({ ...row, orderCount: orderCounts[row.id] || 0 })),
    total: count || 0,
    page,
    pageSize,
  };
}

export async function fetchCustomerOrderCounts() {
  const counts = new Map();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('customer_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    batch.forEach((row) => {
      if (!row.customer_id) return;
      counts.set(row.customer_id, (counts.get(row.customer_id) || 0) + 1);
    });
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return Object.fromEntries(counts.entries());
}

export async function setCustomerTier(id, tier) {
  const { error } = await supabase
    .from('customers')
    .update({ tier })
    .eq('id', id);
  if (error) throw error;
}

export async function approveCustomer(id, approved = true) {
  const { error } = await supabase
    .from('customers')
    .update({ is_approved: approved })
    .eq('id', id);
  if (error) throw error;
}

export async function updateCustomerAdmin(id, fields) {
  const { data, error } = await supabase
    .from('customers')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkSetTiersFromCsv(rows) {
  // rows: [{ email, tier }]
  for (const row of rows) {
    if (!row.email || !['regular', 'premium'].includes(row.tier)) continue;
    await supabase
      .from('customers')
      .update({ tier: row.tier })
      .eq('email', row.email.trim().toLowerCase());
  }
}

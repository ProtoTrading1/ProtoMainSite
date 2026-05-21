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
  const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize), search: searchQuery });
  const res = await fetch(`/api/admin-customers?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to fetch customers');
  // orderCount is now included server-side — no second round-trip needed
  return {
    rows: json.rows || [],
    total: json.total || 0,
    page: json.page || page,
    pageSize: json.pageSize || pageSize,
  };
}

export async function deleteCustomer(id) {
  const res = await fetch('/api/admin-customers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete customer');
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

import { supabase } from './supabase';

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
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
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

import { supabase } from './supabase';

/** Idempotency key for one checkout attempt (crypto.randomUUID with fallback). */
export function makeClientRef() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
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

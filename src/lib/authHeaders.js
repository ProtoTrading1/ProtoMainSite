import { supabase } from './supabase';

export async function authHeaders(extraHeaders = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders };
}

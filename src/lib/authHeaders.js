import { supabase } from './supabase';

export async function authHeaders(sessionOrToken = null, extraHeaders = {}) {
  const tokenFromArg = typeof sessionOrToken === 'string'
    ? sessionOrToken
    : sessionOrToken?.access_token;

  if (tokenFromArg) {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFromArg}`, ...extraHeaders };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders };
}

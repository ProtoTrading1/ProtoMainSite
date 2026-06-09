import { supabase } from './supabase';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

// Trade applications go through src/lib/tradeApplication.js (includes WhatsApp opt-in).
export { submitTradeApplication } from './tradeApplication';

export async function resetPassword(email) {
  const trimmed = email.trim();
  const res = await fetch('/api/send-reset-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send reset email');
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCustomerProfile(userId, sessionOrToken = null) {
  try {
    const { authHeaders } = await import('./authHeaders');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`/api/customer-profile?userId=${encodeURIComponent(userId)}`, {
      headers: await authHeaders(sessionOrToken),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    return json.profile ?? null;
  } catch {
    return null;
  }
}

// Update WhatsApp opt-in for the logged-in user (writes accept_whatsapp + whatsapp_opt_in_at)
export async function updateWhatsappOptIn(acceptWhatsapp, whatsappPhone = null) {
  const { authHeaders } = await import('./authHeaders');
  const res = await fetch('/api/customer-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ acceptWhatsapp, whatsappPhone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update WhatsApp preference');
  return data.profile;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

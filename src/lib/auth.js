import { supabase } from './supabase';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// There is deliberately NO signUp() here. Creating an account from the client
// would fire Supabase's own "confirm your email" mail — the step we removed —
// and would create an account without a trade application, skipping the
// approval queue. Accounts are created server-side by api/register-trade.js
// (email_confirm: true, is_approved decided by the allowlist) and nowhere else.

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const { authHeaders } = await import('./authHeaders');
    const res = await fetch(`/api/customer-profile?userId=${encodeURIComponent(userId)}`, {
      headers: await authHeaders(sessionOrToken),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.profile) {
      const error = new Error(json.error || 'Your trade account could not be loaded.');
      error.status = res.status;
      error.code = json.code || 'CUSTOMER_PROFILE_LOOKUP_FAILED';
      throw error;
    }
    return json.profile;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Your trade account is taking too long to load.');
      timeoutError.code = 'CUSTOMER_PROFILE_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
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

export async function markPortalWelcomeSeen() {
  const { authHeaders } = await import('./authHeaders');
  const res = await fetch('/api/customer-profile', {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ markPortalWelcomeSeen: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to record the portal welcome');
    error.status = res.status;
    error.code = data.code || 'PORTAL_WELCOME_MARK_FAILED';
    error.data = data;
    throw error;
  }
  return data.portalWelcomeSeenAt;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

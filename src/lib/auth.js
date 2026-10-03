import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { requestJson } from './requestDeadline.mjs';
import { loadCustomerProfile } from './customerProfileClient.mjs';
import { createPasswordSignIn } from './passwordSignIn.mjs';
import { loginTransport } from './loginTransport.mjs';
import { assertAuthIdentity, captureAuthIdentity } from './authHeaders';

let provisionalId = 0;
export const signIn = createPasswordSignIn({
  createProvisional: signal => createClient(
    import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY,
    { global: { fetch: (input, init) => fetch(input, { ...init, signal }) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
        storageKey: `proto-signin-provisional-${++provisionalId}` } },
  ),
  captureOwnership: captureAuthIdentity,
  assertOwnership: assertAuthIdentity,
  prepareCommit: () => supabase.auth.initialize(),
  commitSession: session => {
    const identity = captureAuthIdentity();
    return loginTransport.commit(() => supabase.auth.setSession({
      access_token: session.access_token, refresh_token: session.refresh_token,
    }), { assertOwnership: () => assertAuthIdentity(identity) });
  },
});

// Self-service applications use the server registration endpoint so the trade
// profile and one-time mailbox verification are created together. Direct Auth
// signups remain unapproved and cannot bypass trade application review.

// Trade applications go through src/lib/tradeApplication.js (includes WhatsApp opt-in).
export { submitTradeApplication } from './tradeApplication';

export async function resetPassword(email) {
  const trimmed = email.trim();
  return requestJson('/api/send-reset-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed }),
  }, { timeoutMs: 15000, message: 'We could not confirm whether the reset email was sent. Check your inbox and spam folder before requesting another.' });
}

export function resendTradeVerification(email) {
  return requestJson('/api/resend-trade-verification', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: String(email || '').trim() }),
  }, { timeoutMs: 15000, message: 'We could not confirm whether the email was sent. Check your inbox and spam folder before requesting another.' });
}

export async function signOut() {
  // Browsing data cached for speed is dropped before the session ends, so
  // nothing of one customer's session is left behind for the next.
  const { clearStoredInstoreResponses } = await import('./extendedRange');
  clearStoredInstoreResponses();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCustomerProfile(userId, sessionOrToken = null) {
  return loadCustomerProfile(userId, { headers: async () => {
    const { authHeaders } = await import('./authHeaders');
    return authHeaders(sessionOrToken);
  } });
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

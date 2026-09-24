import { createClient } from '@supabase/supabase-js';
import { signResetToken, verifyResetTokenRaw } from './_reset-token.js';

// Reset links are short-lived and single-use.
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/;

/**
 * Signing secret for reset tokens. Requires a dedicated env var and FAILS CLOSED
 * (returns undefined) if none is set â€” deliberately NO fallback to the Supabase
 * service-role key, so a misconfiguration surfaces as "Server misconfigured"
 * instead of silently signing tokens with the DB master key.
 */
export function getResetSecret() {
  return process.env.RESET_TOKEN_SECRET || process.env.CUSTOMER_RESET_TOKEN_SECRET || undefined;
}

/**
 * Service-role client for the Portal project. IMPORTANT: the Supabase API key is
 * the service-role key, NOT the reset-token secret. (The previous code passed
 * the reset secret as the API key, which broke the moment a dedicated reset
 * secret was configured.)
 */
export function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function makeResetToken(email, secret, tokenVersion = 0, ttlMs = DEFAULT_TTL_MS) {
  return signResetToken({ email, v: tokenVersion, scope: 'customer' }, secret, ttlMs);
}

/** Returns { email, v, exp }; throws on tamper/expiry/scope/format failure. */
export function verifyResetToken(token, secret) {
  const data = verifyResetTokenRaw(token, secret);
  // Scope isolation: a customer link must not be redeemable via an admin token
  // (or vice-versa) if the two surfaces ever share RESET_TOKEN_SECRET.
  if (data.scope !== 'customer') throw new Error('Invalid or expired reset link.');
  const email = String(data.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Invalid or expired reset link.');
  return { email, v: Number(data.v) || 0, exp: Number(data.exp) || 0 };
}

/** Per-user token version in server-controlled app_metadata. */
export function getResetTokenVersion(user) {
  return Number(user?.app_metadata?.reset_token_version || 0);
}

export async function bumpResetTokenVersion(supabase, user) {
  const next = getResetTokenVersion(user) + 1;
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata || {}), reset_token_version: next },
  });
  if (error) console.error('bumpResetTokenVersion:', error.message);
  return next;
}

/**
 * Force-logout: deletes the user's GoTrue sessions (migration 029 RPC). This is
 * fail-closed because password reset must not promise a global sign-out while
 * a stale or stolen session remains usable.
 */
export async function revokeUserSessions(supabase, userId) {
  const { error } = await supabase.rpc('revoke_user_sessions', { p_user_id: userId });
  if (error) throw error;
}

export async function consumeResetToken(supabase, tokenHash, userId, expiresAt) {
  const { data, error } = await supabase.rpc('consume_password_reset_token', {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) throw error;
  return data === true;
}

export async function findUserByEmail(supabase, email) {
  const target = String(email || '').trim().toLowerCase();

  // The customer row carries the Auth user id and avoids scanning the Auth
  // directory page by page. This matters once the user count grows beyond the
  // bounded fallback window below.
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, email')
    .eq('email', target)
    .maybeSingle();
  if (!customerError && customer?.id && customer.email?.trim().toLowerCase() === target) {
    const { data, error } = await supabase.auth.admin.getUserById(customer.id);
    if (!error && data?.user?.email?.trim().toLowerCase() === target) return data.user;
  }

  // Compatibility fallback for older accounts whose customer row is missing.
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = (data?.users || []).find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (!data?.users?.length || data.users.length < 200) break;
    page += 1;
  }
  return null;
}


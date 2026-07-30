/**
 * How long a single sign-in stays valid. Supabase refreshes the access token
 * roughly hourly and would otherwise keep a session alive indefinitely, so this
 * is the cap that forces a customer back to the login screen.
 *
 * Mirror this in the Supabase dashboard under Authentication → Sessions →
 * "Time-box user sessions" (720 hours) so the server enforces it too — this
 * module only governs the browser.
 */
export const SESSION_MAX_AGE_DAYS = 30;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * True when a restored session is past the sign-in window.
 *
 * Keyed on `user.last_sign_in_at`, which is stamped when the password is
 * actually entered and is NOT touched by a token refresh — so this measures the
 * age of the LOGIN, not of the current access token. Anything unreadable (a
 * missing or malformed timestamp, a device clock behind the sign-in) is treated
 * as "not expired": a session that cannot be dated is a bad reason to throw a
 * customer out mid-order.
 */
export function isSessionExpired(session, now = Date.now()) {
  if (!session) return false;
  const stamp = session.user?.last_sign_in_at;
  if (!stamp) return false;
  const signedInAt = Date.parse(stamp);
  if (!Number.isFinite(signedInAt)) return false;
  return now - signedInAt > SESSION_MAX_AGE_MS;
}

/**
 * Whether a persisted session is sitting in storage waiting to be restored.
 *
 * Supabase writes it under `sb-<project-ref>-auth-token`; matching the shape
 * rather than hardcoding the ref keeps this working if the project changes.
 * The bootstrap uses it to decide how long to wait before giving up and
 * showing the logged-out landing page — a returning customer should never see
 * that page flash while their session is still being refreshed.
 */
export function hasStoredSession(storage) {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    if (!store) return false;
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
    return false;
  } catch {
    // Private browsing can throw on storage access — assume nothing is stored.
    return false;
  }
}

/** Whole days left before the customer has to sign in again (0 once expired). */
export function sessionDaysRemaining(session, now = Date.now()) {
  const stamp = session?.user?.last_sign_in_at;
  if (!stamp) return SESSION_MAX_AGE_DAYS;
  const signedInAt = Date.parse(stamp);
  if (!Number.isFinite(signedInAt)) return SESSION_MAX_AGE_DAYS;
  const remaining = SESSION_MAX_AGE_MS - (now - signedInAt);
  return remaining <= 0 ? 0 : Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

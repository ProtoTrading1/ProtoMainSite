import { Intercom, boot, shutdown, show, update } from '@intercom/messenger-js-sdk';

export const INTERCOM_APP_ID = 'qk0xorsx';

// Launcher visibility is driven by the current surface (see Root.jsx). We track
// it here because identifying a user requires a full shutdown + re-boot, and the
// re-boot has to preserve whatever visibility the current view asked for.
let launcherVisible = false;

// The Supabase user id the Messenger is currently booted as, so repeated auth
// events (INITIAL_SESSION firing alongside getSession, re-renders, etc.) don't
// tear the Messenger down and rebuild it over and over.
let identifiedUserId = null;
let identifyInFlightFor = null;
// Intercom() is the loader; boot() assumes it has already run, so the first
// mount must use it.
let loaded = false;

/**
 * `signed_in` is the audience switch.
 *
 * Logged-out visitors get the Messenger as an anonymous lead so they can ask
 * about trading hours, delivery and how to open an account. Fin decides what
 * it may answer from this attribute, and the catalogue connector refuses
 * anyone without a verified `user_id` regardless (api/intercom/_contact.js) —
 * so a lead cannot be talked into a stock level or a price.
 */
const PUBLIC_ATTRIBUTES = { signed_in: false };
const CUSTOMER_ATTRIBUTES = { signed_in: true };

function settings(extra = {}) {
  return {
    app_id: INTERCOM_APP_ID,
    alignment: 'right',
    horizontal_padding: 20,
    vertical_padding: 20,
    hide_default_launcher: !launcherVisible,
    ...PUBLIC_ATTRIBUTES,
    ...extra,
  };
}

/**
 * Put the Messenger on the page, or re-boot it under a new identity.
 *
 * The first call has to go through Intercom() — that is the loader that injects
 * the script. boot() only re-configures an already-loaded Messenger, so calling
 * it first is a no-op that silently leaves the page with no chat at all.
 */
function mount(extra = {}) {
  if (!loaded) {
    Intercom(settings(extra));
    loaded = true;
    return;
  }
  // Already loaded, possibly as someone else. Clear that identity first,
  // otherwise the self-declared email on the visitor record survives and
  // Intercom keeps treating it as the contact's address.
  try {
    shutdown();
  } catch {
    /* nothing booted yet */
  }
  boot(settings(extra));
}

/**
 * Put the Messenger on the page for a visitor who is not signed in.
 *
 * No `user_id` and no JWT: Intercom records an anonymous lead, which is what
 * keeps the audience split honest — Fin can tell a prospect from a customer
 * without taking the browser's word for it.
 *
 * Safe to call repeatedly; it only mounts once, and never downgrades a
 * customer who has already been identified.
 */
export function ensurePublicIntercom() {
  if (loaded || identifiedUserId || identifyInFlightFor) return;
  try {
    mount();
  } catch (error) {
    console.error('Unable to load Intercom for a public visitor:', error);
  }
}

export function openIntercom() {
  try {
    // "Ask Proto" has to open something. The Messenger normally loads as part of
    // identifying the customer, but when that identity call cannot complete
    // (secret not configured, rate limited, endpoint down) nothing was on the
    // page and the button threw into the console. An unverified chat is a
    // degraded chat; a missing one is no chat.
    if (!loaded) mount();
    show();
  } catch (error) {
    console.error('Unable to open Intercom:', error);
  }
}

export function setIntercomLauncherVisibility(visible) {
  launcherVisible = Boolean(visible);
  // Nothing to update before the Messenger loads — the next mount() reads the
  // flag straight out of settings().
  if (!loaded) return;
  try {
    update(settings());
  } catch (error) {
    console.error('Unable to update Intercom:', error);
  }
}

async function fetchIdentityToken(session) {
  const { authHeaders } = await import('./authHeaders');
  const res = await fetch('/api/intercom/jwt', { headers: await authHeaders(session) });
  if (!res.ok) {
    // Worth naming: 503 means INTERCOM_MESSENGER_SECRET is missing on the
    // deployment, 403 means the account is not an approved trade account, 429
    // is the rate limiter. Without this the widget just quietly ran unverified.
    console.warn(`Intercom identity unavailable (HTTP ${res.status}) — chat will run unverified.`);
    return null;
  }
  const json = await res.json();
  return json?.token || null;
}

/**
 * Boot the Messenger as the signed-in, approved customer.
 *
 * If the signed identity cannot be issued the Messenger is still loaded, just
 * unverified — the customer keeps a working chat button, and because no
 * verified email reaches Intercom, Fin's catalogue connector still refuses to
 * hand out prices rather than failing open. `identifiedUserId` stays null in
 * that case so a later auth event retries the upgrade.
 */
export async function identifyIntercom(session) {
  const userId = session?.user?.id || null;
  if (!userId) return false;
  if (identifiedUserId === userId) return true;
  if (identifyInFlightFor === userId) return false;

  identifyInFlightFor = userId;
  try {
    const token = await fetchIdentityToken(session);
    if (!token) {
      if (!loaded) mount();
      return false;
    }
    mount({ intercom_user_jwt: token, ...CUSTOMER_ATTRIBUTES });
    identifiedUserId = userId;
    return true;
  } catch (error) {
    console.error('Unable to identify Intercom user:', error);
    // Same fallback as a missing token: a signed-in customer should never be
    // left staring at a chat button that does nothing.
    try {
      if (!loaded) mount();
    } catch {
      /* the SDK is unavailable; nothing further to do */
    }
    return false;
  } finally {
    identifyInFlightFor = null;
  }
}

/**
 * Swap in a freshly signed JWT without tearing down the conversation UI.
 * Called on Supabase TOKEN_REFRESHED so a long-lived tab doesn't silently lose
 * its verified identity when the JWT expires.
 */
export async function refreshIntercomIdentity(session) {
  // Never identified (or identified as someone else): treat the refresh as a
  // chance to try again, rather than leaving the tab unverified for its whole
  // lifetime because one identity call failed at sign-in.
  if (!identifiedUserId || session?.user?.id !== identifiedUserId) {
    return identifyIntercom(session);
  }
  try {
    const token = await fetchIdentityToken(session);
    if (!token) return false;
    update({ intercom_user_jwt: token, ...CUSTOMER_ATTRIBUTES });
    return true;
  } catch (error) {
    console.error('Unable to refresh Intercom identity:', error);
    return false;
  }
}

/**
 * Drop the customer's identity on logout and fall back to the public visitor.
 *
 * The shutdown is the important half: without it the Messenger keeps the
 * previous customer's identity after sign-out, so on a shared shop machine the
 * next person inherits it — and with the catalogue connector live, their trade
 * prices. Re-booting anonymously afterwards is what leaves a signed-out visitor
 * the same limited chat a first-time visitor gets, rather than no chat at all.
 */
export function resetIntercom() {
  identifiedUserId = null;
  identifyInFlightFor = null;
  if (!loaded) return;
  try {
    shutdown();
    loaded = false;
    // Fresh anonymous session: no user_id, no JWT, signed_in false.
    mount();
  } catch (error) {
    console.error('Unable to reset Intercom:', error);
  }
}

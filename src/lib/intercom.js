import { boot, shutdown, show, update } from '@intercom/messenger-js-sdk';

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

function settings(extra = {}) {
  return {
    app_id: INTERCOM_APP_ID,
    alignment: 'right',
    horizontal_padding: 20,
    vertical_padding: 20,
    hide_default_launcher: !launcherVisible,
    ...extra,
  };
}

/** Settings for the initial anonymous boot in main.jsx — single source of truth. */
export function intercomInitSettings() {
  return settings();
}

export function openIntercom() {
  try {
    show();
  } catch (error) {
    console.error('Unable to open Intercom:', error);
  }
}

export function setIntercomLauncherVisibility(visible) {
  launcherVisible = Boolean(visible);
  try {
    update(settings());
  } catch (error) {
    console.error('Unable to update Intercom:', error);
  }
}

async function fetchIdentityToken(session) {
  const { authHeaders } = await import('./authHeaders');
  const res = await fetch('/api/intercom/jwt', { headers: await authHeaders(session) });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.token || null;
}

/**
 * Re-boot the Messenger as the signed-in, approved customer.
 *
 * Returns false and leaves the Messenger anonymous if the customer isn't
 * approved yet or the endpoint is unavailable — Fin's catalogue connector then
 * correctly refuses to hand out prices rather than failing open.
 */
export async function identifyIntercom(session) {
  const userId = session?.user?.id || null;
  if (!userId) return false;
  if (identifiedUserId === userId) return true;
  if (identifyInFlightFor === userId) return false;

  identifyInFlightFor = userId;
  try {
    const token = await fetchIdentityToken(session);
    if (!token) return false;
    // Clear any anonymous/lead identity first, otherwise the self-declared
    // email on the visitor record survives and Intercom keeps treating it as
    // the contact's address.
    try {
      shutdown();
    } catch {
      /* nothing booted yet */
    }
    boot(settings({ intercom_user_jwt: token }));
    identifiedUserId = userId;
    return true;
  } catch (error) {
    console.error('Unable to identify Intercom user:', error);
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
  if (!identifiedUserId || session?.user?.id !== identifiedUserId) return false;
  try {
    const token = await fetchIdentityToken(session);
    if (!token) return false;
    update({ intercom_user_jwt: token });
    return true;
  } catch (error) {
    console.error('Unable to refresh Intercom identity:', error);
    return false;
  }
}

/**
 * Wipe the Intercom contact on logout and re-boot anonymously.
 *
 * Without this the Messenger keeps the previous customer's identity after
 * sign-out — on a shared shop machine the next person inherits it, and with the
 * catalogue connector live that means someone else's trade prices.
 */
export function resetIntercom() {
  identifiedUserId = null;
  identifyInFlightFor = null;
  try {
    shutdown();
    boot(settings());
  } catch (error) {
    console.error('Unable to reset Intercom:', error);
  }
}

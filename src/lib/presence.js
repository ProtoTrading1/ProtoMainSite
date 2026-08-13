/**
 * Presence heartbeat — tells the admin dashboard this customer is browsing.
 *
 * Cost and accuracy both live in this file. Every open tab is a recurring
 * request, so the loop is deliberately conservative:
 *
 *   - it only runs for a signed-in customer;
 *   - it stops while the tab is hidden, and beats once immediately on return,
 *     so a background tab left open all day costs nothing and does not inflate
 *     the count with someone who is not actually looking;
 *   - one beat per minute, against a two-minute freshness window in the admin,
 *     so a single dropped request never blinks a live shopper out of view;
 *   - failures are swallowed. A presence beat must never disturb shopping.
 */
/**
 * Exported because it is half of a cross-repo contract: Proto_Admin's
 * /api/live-shoppers counts a customer as browsing for FRESHNESS_SECONDS after
 * their last beat, and that window must stay at least two beats wide.
 */
export const HEARTBEAT_MS = 60000;
const SESSION_KEY = 'proto_journey_session';

/** Reuses the journey session id so one tab reads as one session in both places. */
function presenceSessionId() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

async function supabaseAccessToken() {
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

async function send(method, getToken) {
  // An unauthenticated beat would be rejected anyway — skip the round trip.
  const token = await getToken();
  if (!token) return false;
  try {
    const response = await fetch('/api/presence', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      keepalive: true,
      ...(method === 'POST'
        ? { body: JSON.stringify({ sessionId: presenceSessionId() }) }
        : {}),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start beating. Returns a stop function that clears the row, so signing out
 * or unmounting drops the count immediately rather than after the window.
 */
export function startPresenceHeartbeat({ getToken = supabaseAccessToken } = {}) {
  if (typeof window === 'undefined') return () => {};

  let timer = null;
  let stopped = false;

  const beat = () => { void send('POST', getToken); };

  const start = () => {
    if (stopped || timer) return;
    beat();
    timer = window.setInterval(beat, HEARTBEAT_MS);
  };

  const pause = () => {
    if (!timer) return;
    window.clearInterval(timer);
    timer = null;
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') start();
    else pause();
  };

  if (document.visibilityState === 'visible') start();
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    pause();
    document.removeEventListener('visibilitychange', onVisibility);
    void send('DELETE', getToken);
  };
}

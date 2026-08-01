const SESSION_KEY = 'proto_journey_session';

function journeySessionId() {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = window.crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : null;
  }
}
/**
 * Privacy-safe customer-journey event. Never include names, email addresses,
 * phone numbers, addresses, product lines, free-text notes or search terms.
 * Analytics must never delay or block the customer journey.
 */
export function trackJourneyEvent(eventType, {
  journey,
  step = null,
  outcome = null,
  metadata = {},
} = {}) {
  if (!eventType || !journey) return;

  Promise.resolve().then(async () => {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const { supabase } = await import('./supabase');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // Pre-auth registration and recovery events are intentionally anonymous.
    }

    await fetch('/api/journey-analytics', {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({
        eventType,
        journey,
        step,
        outcome,
        sessionId: journeySessionId(),
        metadata,
      }),
    });
  }).catch(() => {});
}

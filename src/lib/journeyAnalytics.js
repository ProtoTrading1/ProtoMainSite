import { analyticsSessionId } from './analyticsSession.js';
const journeySessionId = analyticsSessionId;

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

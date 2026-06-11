/** Fire-and-forget analytics event — never throws to callers. */
export function trackEvent({ eventType, entityId, entityLabel, customerId } = {}) {
  if (!eventType) return;
  fetch('/api/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType, entityId, entityLabel, customerId }),
  }).catch(() => {});
}

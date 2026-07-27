/** Fire-and-forget analytics event — never throws to callers. */
export function trackEvent({ eventType, entityId, entityLabel } = {}) {
  if (!eventType) return;
  import('./authHeaders').then(async ({ authHeaders }) => {
    await fetch('/api/track-event', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ eventType, entityId, entityLabel }),
    });
  }).catch(() => {});
}

import { boundedRequest } from './boundedRequest.mjs';

const pendingChecks = new Map();

export function checkRegistrationEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (pendingChecks.has(normalized)) return pendingChecks.get(normalized);
  const pending = boundedRequest(async (signal) => {
    const response = await fetch('/api/check-registration-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'We could not check this email right now. Please try again.');
    if (typeof data.exists !== 'boolean' || typeof data.available !== 'boolean' || data.exists === data.available) {
      throw new Error('We could not confirm this email. Please try again.');
    }
    return data;
  }, { timeoutMessage: 'The email check timed out. Your details are kept here. Please try again.' })
    .finally(() => pendingChecks.delete(normalized));
  pendingChecks.set(normalized, pending);
  return pending;
}

import { requestJson } from './requestDeadline.mjs';

export async function checkRegistrationEmail(email) {
  return requestJson('/api/check-registration-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim().toLowerCase() }),
  }, { timeoutMs: 10_000, message: 'We could not check this email right now. Please try again.' });
}

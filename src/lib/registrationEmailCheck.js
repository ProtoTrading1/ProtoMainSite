export async function checkRegistrationEmail(email) {
  const response = await fetch('/api/check-registration-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim().toLowerCase() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'We could not check this email right now. Please try again.');
  return data;
}

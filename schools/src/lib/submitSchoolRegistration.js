/** POST the completed form to the site's own serverless endpoint. */
export async function submitSchoolRegistration(payload) {
  const res = await fetch('/api/register-school', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Registration failed. Please try again.');
    error.code = data.code || null;
    throw error;
  }
  return data;
}

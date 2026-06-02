export async function submitTradeApplication({ email, password, contactName, businessName, phone, country, province, city, businessType, whatsappOptIn }) {
  const res = await fetch('/api/register-trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, contactName, businessName, phone, country, province, city, businessType, whatsappOptIn }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

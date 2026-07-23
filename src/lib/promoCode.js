import { authHeaders } from './authHeaders';

export async function validatePromoCode(code, subtotal) {
  const res = await fetch('/api/validate-promo', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code: String(code || '').trim(), subtotal: Number(subtotal) || 0 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Could not verify promo code.');
  }
  return data;
}

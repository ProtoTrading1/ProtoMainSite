/** Fire-and-forget product feedback for the Admin opportunity inbox. */
export async function submitProductFeedback({ productId, productCode, productLabel, reason, detail = '' } = {}) {
  if (!reason) return false;
  try {
    const { authHeaders } = await import('./authHeaders');
    const res = await fetch('/api/product-feedback', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ productId, productCode, productLabel, reason, detail }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

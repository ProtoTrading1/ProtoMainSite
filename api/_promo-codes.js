import { readSiteConfigJson } from './_site-config.js';

const PROMO_FILE = 'promo-codes.json';

export function normalizePromoCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

export async function loadPromoCodes() {
  const data = await readSiteConfigJson(PROMO_FILE, { codes: [] });
  return Array.isArray(data?.codes) ? data.codes : [];
}

export async function validatePromoCode(code, subtotal) {
  const normalized = normalizePromoCode(code);
  if (!normalized) {
    return { valid: false, error: 'Enter a promo code.' };
  }

  const sub = Number(subtotal) || 0;
  if (sub <= 0) {
    return { valid: false, error: 'Add products to your order first.' };
  }

  const codes = await loadPromoCodes();
  const match = codes.find((entry) => (
    normalizePromoCode(entry.code) === normalized && entry.active !== false
  ));

  if (!match) {
    return { valid: false, error: 'Invalid promo code.' };
  }

  if (match.expiresAt && new Date(match.expiresAt) < new Date()) {
    return { valid: false, error: 'This promo code has expired.' };
  }

  const minOrder = Number(match.minOrder) || 0;
  if (minOrder > 0 && sub < minOrder) {
    return { valid: false, error: `Minimum order R${minOrder.toFixed(2)} required for this code.` };
  }

  const discountPct = Number(match.discountPct) || 0;
  if (discountPct <= 0 || discountPct > 100) {
    return { valid: false, error: 'Invalid promo code.' };
  }

  const discountAmount = Math.round((sub * discountPct / 100) * 100) / 100;
  const total = Math.max(0, Math.round((sub - discountAmount) * 100) / 100);

  return {
    valid: true,
    code: normalized,
    discountPct,
    discountAmount,
    subtotal: sub,
    total,
    label: match.label || null,
  };
}

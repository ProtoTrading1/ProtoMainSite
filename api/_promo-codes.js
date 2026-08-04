import { readSiteConfigJson } from './_site-config.js';

const PROMO_FILE = 'promo-codes.json';
export const TEN_THOUSAND_CLUB_PROMO = 'PROTO75';
export const TEN_THOUSAND_CLUB_MIN_SALES = 10000;
export const TEN_THOUSAND_CLUB_DISCOUNT_PCT = 7.5;
export const TEN_THOUSAND_CLUB_EXPIRES_AT = '2026-08-31T21:59:59.999Z';

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
  const configured = codes.find((entry) => (
    normalizePromoCode(entry.code) === normalized && entry.active !== false
  ));
  // PROTO75 is a protected campaign contract: the code means 7.5% (not 75%)
  // and expires at the end of 31 August 2026 South African time. Eligibility
  // is checked separately against verified customer sales on the server.
  const match = normalized === TEN_THOUSAND_CLUB_PROMO
    ? {
      ...configured,
      code: TEN_THOUSAND_CLUB_PROMO,
      discountPct: TEN_THOUSAND_CLUB_DISCOUNT_PCT,
      expiresAt: TEN_THOUSAND_CLUB_EXPIRES_AT,
      active: true,
    }
    : configured;

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

export async function isCustomerEligibleForPromo(supabase, customerId, code) {
  const normalized = normalizePromoCode(code);
  if (normalized !== TEN_THOUSAND_CLUB_PROMO) return true;
  if (!customerId) return false;
  const { data, error } = await supabase
    .from('customers')
    .select('sales_last_12_months')
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw new Error('Could not verify 10,000 Club eligibility. Please try again.');
  return Number(data?.sales_last_12_months) >= TEN_THOUSAND_CLUB_MIN_SALES;
}

/**
 * One redemption per customer: true if this customer already has a ledger row
 * for the code. Checked during cart validation for immediate feedback; order
 * submission separately claims the unique row before capture.
 */
export async function hasCustomerUsedPromo(supabase, customerId, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!customerId || !normalized) return false;
  // The ledger, not the orders table, is the source of truth: admins delete
  // test orders, and a check that reads orders forgets the redemption the
  // moment the order is cleaned up — which is exactly how a one-per-customer
  // code got used twice in production. promo_redemptions rows are never
  // deleted with the order (migration 056).
  const { data, error } = await supabase
    .from('promo_redemptions')
    .select('id')
    .eq('customer_id', customerId)
    .eq('promo_code', normalized)
    .limit(1);
  if (error) {
    // Fail CLOSED: if usage cannot be verified, do not grant the discount —
    // an outage must not turn a one-per-customer code into an unlimited one.
    throw new Error('Could not verify promo code usage. Please try again.');
  }
  return Boolean(data?.length);
}

export async function claimPromoRedemption(supabase, { customerId, code }) {
  const normalized = normalizePromoCode(code);
  if (!customerId || !normalized) throw new Error('Promo redemption could not be verified.');
  const { data, error } = await supabase
    .from('promo_redemptions')
    .insert({ customer_id: customerId, promo_code: normalized })
    .select('id')
    .single();
  if (error && /duplicate|unique/i.test(error.message || '')) return null;
  if (error || !data?.id) throw new Error('Could not reserve this promo code. Please try again.');
  return data.id;
}

export async function finalisePromoRedemption(supabase, { redemptionId, orderId, orderNumber }) {
  if (!redemptionId) return;
  const { error } = await supabase
    .from('promo_redemptions')
    .update({ order_id: orderId || null, order_number: orderNumber || null })
    .eq('id', redemptionId);
  if (error) console.error('promo redemption finalise failed:', error.message);
}

export async function releasePromoRedemption(supabase, redemptionId) {
  if (!redemptionId) return;
  const { error } = await supabase
    .from('promo_redemptions')
    .delete()
    .eq('id', redemptionId)
    .is('order_id', null);
  if (error) console.error('promo redemption release failed:', error.message);
}

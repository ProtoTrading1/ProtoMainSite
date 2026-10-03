export const PROTO_ACTIVE_SELECT =
  'id, account_code, name, contact_name, first_name, email, sales_last_12_months, invoice_count, last_purchase_date';

/** Look up a proto-active allowlist row by email (exact match, lowercased). */
export async function lookupProtoActiveByEmail(supabase, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await supabase
    .from('proto_active_customers')
    .select(PROTO_ACTIVE_SELECT)
    .eq('email', normalized)
    .maybeSingle();
  return data;
}

/**
 * Resolve a possible existing customer match.
 *
 * An exact email match is eligibility evidence, not mailbox proof.
 * A customer code can still help the team reconcile an application,
 * but it must never update a legacy record or approve an account on its own.
 */
export async function lookupProtoActiveCustomer(supabase, email, customerCode) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedCode = customerCode
    ? String(customerCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    : '';

  if (normalizedEmail) {
    const row = await lookupProtoActiveByEmail(supabase, normalizedEmail);
    if (row) return { row, matchType: 'email' };
  }

  if (normalizedCode && /^[A-Z0-9]{6}$/.test(normalizedCode)) {
    const { data: matches } = await supabase
      .from('proto_active_customers')
      .select(PROTO_ACTIVE_SELECT)
      .eq('account_code', normalizedCode)
      .order('sales_last_12_months', { ascending: false })
      .limit(1);
    const data = matches?.[0] ?? null;
    if (!data) return { row: null, matchType: null };
    return { row: data, matchType: 'customer_code' };
  }

  return { row: null, matchType: null };
}

/** Call only with the user returned by successful server-side OTP verification. */
export function isVerifiedProtoActiveMatch(match, verifiedUser) {
  const confirmedEmail = verifiedUser?.email_confirmed_at && String(verifiedUser.email || '').trim().toLowerCase();
  return Boolean(confirmedEmail && match?.matchType === 'email' && match?.row?.account_code
    && String(match.row.email || '').trim().toLowerCase() === confirmedEmail);
}

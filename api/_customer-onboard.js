import { normalizeWhatsapp, watiConfig, watiEnsureContact } from './_wati-notify.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WELCOME_TEMPLATE = 'proto_welcome_';

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
 * Only an exact email match is identity-verified enough to grant immediate
 * access. A customer code can still help the team reconcile an application,
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

/** True only when the customer's identity was verified by their registered email. */
export function isVerifiedProtoActiveMatch(match) {
  return Boolean(match?.matchType === 'email' && match?.row?.account_code);
}

async function isCustomerCodeTaken(supabase, code) {
  const upper = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(upper)) return true;

  const [{ data: customerHit }, { data: protoHit }] = await Promise.all([
    supabase.from('customers').select('id').eq('customer_code', upper).maybeSingle(),
    supabase.from('proto_active_customers').select('id').eq('account_code', upper).maybeSingle(),
  ]);
  return Boolean(customerHit || protoHit);
}

function randomCustomerCode() {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

/** Allocate a unique 6-char customer code; prefer preferredCode when available. */
export async function allocateCustomerCode(supabase, preferredCode) {
  const preferred = preferredCode
    ? String(preferredCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    : '';

  if (preferred && /^[A-Z0-9]{6}$/.test(preferred) && !(await isCustomerCodeTaken(supabase, preferred))) {
    return preferred;
  }

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const code = randomCustomerCode();
    if (!(await isCustomerCodeTaken(supabase, code))) return code;
  }

  throw new Error('Failed to allocate a unique customer code');
}

/** Send the WATI proto_welcome_ template after signup opt-in. */
export async function sendWelcomeWhatsapp(customer) {
  const phone = normalizeWhatsapp(customer?.phone);
  if (!phone) return { sent: false, reason: 'no_phone' };

  const { baseUrl, token } = watiConfig();
  if (!token) return { sent: false, reason: 'no_token' };

  const displayName = customer?.contactName || customer?.businessName || 'Customer';

  try {
    await watiEnsureContact(baseUrl, token, phone, displayName).catch(() => {});
    const res = await fetch(
      `${baseUrl}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: WELCOME_TEMPLATE,
          broadcast_name: WELCOME_TEMPLATE,
          parameters: [],
        }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('WATI welcome send error:', res.status, JSON.stringify(body));
      return { sent: false, reason: 'wati_error', status: res.status };
    }
    return { sent: true };
  } catch (err) {
    console.error('WATI welcome error:', err.message);
    return { sent: false, reason: 'exception' };
  }
}

import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { escapeHtml } from './_escape-html.js';

/**
 * School registration for the standalone school-supply site.
 *
 * Writes into the SAME `customers` table the main trade portal uses, flagged
 * `is_school` so the admin dashboard can badge and filter these accounts.
 * Schools are never auto-approved and never get an auto-generated customer
 * code — both stay manual admin steps, exactly as for a trade application.
 */

const BREVO_SENDER = {
  name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
  email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
};

const ADMIN_SIGNUP_RECIPIENTS = (process.env.SIGNUP_NOTIFY_EMAILS
  || 'online@proto.co.za,george@proto.co.za')
  .split(',').map((part) => part.trim()).filter(Boolean);

/** Mirrors of src/lib/schoolFields.js — the browser list drives the UI, this
 * one decides what is actually accepted. */
const VALID_PROVINCES = new Set([
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
]);

const VALID_SUPPLY_NEEDS = new Set([
  'Everyday stationery',
  'Art & creative supplies',
  'Classroom essentials',
]);

/** Reuses the trade portal's existing channel label so schools group naturally
 * with the institution segment already present in the admin dashboard. */
const SCHOOL_SALES_CHANNEL = 'School, church or institution';

const MIN_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const BLOCKED_DOMAINS = new Set([
  'test.com', 'test.co.za', 'example.com', 'example.org', 'mailinator.com',
  'tempmail.com', 'temp-mail.org', 'yopmail.com', '10minutemail.com', 'guerrillamail.com',
]);

function caps(value) {
  return String(value || '').trim().toUpperCase();
}

function buildAdminEmailHtml({ schoolName, province, contactName, schoolRole, email, phone, supplyNeeds }) {
  const rows = [
    ['School', caps(schoolName)],
    ['Province', caps(province)],
    ['Contact', caps(contactName)],
    ['Role at school', caps(schoolRole)],
    ['Email', caps(email)],
    ['Phone', caps(phone)],
    ['Interested in', supplyNeeds.length ? caps(supplyNeeds.join(', ')) : 'NOT ANSWERED'],
  ].map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:700;background:#f9fafb;">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;">${escapeHtml(value)}</td>
    </tr>`).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;">
      <h2>New SCHOOL registration</h2>
      <p>A school signed up on the school-supply site. The account is pending approval in the admin dashboard.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${rows}</table>
    </div>
  `;
}

async function sendAdminEmail(payload) {
  if (!process.env.BREVO_API_KEY) return;
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      // Bounded: a slow Brevo must never hold a registration open.
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        sender: BREVO_SENDER,
        to: ADMIN_SIGNUP_RECIPIENTS.map((address) => ({ email: address })),
        subject: `New school signup — ${caps(payload.schoolName)}`,
        htmlContent: buildAdminEmailHtml(payload),
      }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.error('School signup email Brevo error:', resp.status, JSON.stringify(body));
    }
  } catch (err) {
    console.error('School signup email error:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    schoolName,
    province,
    contactName,
    schoolRole,
    email,
    phone,
    password,
    confirmPassword,
    supplyNeeds,
    authorised,
    company_fax: honeypot,
  } = req.body || {};

  // Honeypot — bots that fill the hidden field get a plausible success.
  if (honeypot) return res.status(200).json({ ok: true });

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedSchoolName = String(schoolName || '').trim().slice(0, 160);
  const normalizedContactName = String(contactName || '').trim().slice(0, 120);
  const normalizedRole = String(schoolRole || '').trim().slice(0, 80);
  const normalizedPhone = String(phone || '').trim().slice(0, 40);
  const normalizedProvince = String(province || '').trim();
  const normalizedSupplyNeeds = Array.isArray(supplyNeeds)
    ? [...new Set(supplyNeeds.map((item) => String(item || '').trim()).filter((item) => VALID_SUPPLY_NEEDS.has(item)))]
    : [];

  if (!normalizedSchoolName) return res.status(400).json({ error: 'Please enter the name of your school.' });
  if (!VALID_PROVINCES.has(normalizedProvince)) {
    return res.status(400).json({ error: 'Please select the province your school is in.' });
  }
  if (!normalizedContactName) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!normalizedRole) return res.status(400).json({ error: 'Please tell us your role at the school.' });
  if (!EMAIL_RE.test(normalizedEmail) || BLOCKED_DOMAINS.has(normalizedEmail.split('@')[1])) {
    return res.status(400).json({ error: 'Please enter a valid school email address.' });
  }
  if (normalizedPhone.replace(/\D/g, '').length < 8) {
    return res.status(400).json({ error: 'Please enter a contact number of at least 8 digits.' });
  }
  if (String(password || '').length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'The two passwords do not match.' });
  }
  if (authorised !== true) {
    return res.status(400).json({ error: 'Please confirm you are authorised to register this school.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('register-school: Supabase env vars missing');
    return res.status(500).json({ error: 'Registration is temporarily unavailable. Please try again shortly.' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ipLimit = await checkRateLimit({
    bucket: `school-register:ip:${clientIp(req)}`,
    max: 8,
    windowSeconds: 900,
    supabase,
  });
  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(ipLimit.retryAfter || 900));
    return res.status(429).json({ error: 'Too many registration attempts. Please try again shortly.' });
  }

  // Access is gated by ADMIN APPROVAL, so there is no mailbox round-trip to
  // make: the address is created already confirmed and the school waits for an
  // admin instead.
  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      name: normalizedContactName,
      phone: normalizedPhone,
      business_name: normalizedSchoolName,
      province: normalizedProvince,
      is_school: true,
      school_role: normalizedRole,
    },
  });

  if (error) {
    if (error.code === 'email_exists') {
      return res.status(409).json({
        error: 'This email is already registered. Sign in on the Proto trade portal, or reset your password there.',
        code: 'EMAIL_ALREADY_REGISTERED',
      });
    }
    console.error('register-school createUser error:', error);
    return res.status(400).json({
      error: 'We could not create an account with these details. Please check them and try again.',
      code: 'ACCOUNT_CREATION_FAILED',
    });
  }

  const userId = data.user?.id;
  if (!userId) {
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }

  // Composed so the admin dashboard's existing "in their own words" panel is
  // useful for a school without needing a school-specific field there.
  const descriptionParts = [
    `School in ${normalizedProvince}.`,
    `Registered by ${normalizedContactName} (${normalizedRole}).`,
  ];
  if (normalizedSupplyNeeds.length) {
    descriptionParts.push(`Interested in: ${normalizedSupplyNeeds.join(', ')}.`);
  }

  const fullPayload = {
    id: userId,
    email: normalizedEmail,
    name: normalizedContactName,
    contact_name: normalizedContactName,
    first_name: normalizedContactName.split(/\s+/)[0] || null,
    phone: normalizedPhone,
    business_name: normalizedSchoolName,
    country: 'South Africa',
    province: normalizedProvince,
    business_type: 'School',
    sales_channels: [SCHOOL_SALES_CHANNEL],
    business_description: descriptionParts.join(' ').slice(0, 400),
    is_school: true,
    school_role: normalizedRole,
    supply_needs: normalizedSupplyNeeds,
    // Never auto-approved, never auto-coded — both are manual admin steps.
    is_approved: false,
    customer_code: null,
    tier: 'regular',
  };

  // The school columns ship in migration 067. Retry with progressively fewer
  // columns so a registration can never fail just because the database has not
  // been migrated yet — the account still lands, minus the school metadata.
  const withoutColumns = (...keys) => Object.fromEntries(
    Object.entries(fullPayload).filter(([key]) => !keys.includes(key)),
  );

  const attempts = [
    fullPayload,
    withoutColumns('supply_needs'),
    withoutColumns('supply_needs', 'school_role'),
    withoutColumns('supply_needs', 'school_role', 'is_school'),
    withoutColumns('supply_needs', 'school_role', 'is_school', 'sales_channels', 'business_description'),
  ];

  let upsertError = null;
  for (const [index, payload] of attempts.entries()) {
    const { error: attemptError } = await supabase.from('customers').upsert(payload, { onConflict: 'id' });
    if (!attemptError) {
      upsertError = null;
      break;
    }
    upsertError = attemptError;
    if (index < attempts.length - 1) {
      console.warn(`school customers upsert attempt ${index + 1} failed, retrying reduced:`, attemptError.message);
    }
  }

  if (upsertError) {
    console.error('register-school customers upsert error:', upsertError.message, '| userId:', userId);
    await supabase.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: 'Failed to create your school profile. Please try again.' });
  }

  await sendAdminEmail({
    schoolName: normalizedSchoolName,
    province: normalizedProvince,
    contactName: normalizedContactName,
    schoolRole: normalizedRole,
    email: normalizedEmail,
    phone: normalizedPhone,
    supplyNeeds: normalizedSupplyNeeds,
  });

  return res.status(200).json({ ok: true, pendingApproval: true });
}

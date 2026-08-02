import { createClient } from '@supabase/supabase-js';
import { escapeHtml } from './_escape-html.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import {
  isVerifiedProtoActiveMatch,
  lookupProtoActiveCustomer,
} from './_customer-onboard.js';
import { PUBLIC_SITE_URL } from './_public-site-url.js';
import { passwordPolicyError } from '../src/lib/passwordPolicy.js';

const BREVO_SENDER = {
  name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
  email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
};

export function accountCreationFailureResponse() {
  return {
    error: 'We could not create a new account with these details. If you have registered before, sign in or use Forgot password. Otherwise, check your details and try again.',
    code: 'ACCOUNT_CREATION_FAILED',
    recovery: 'SIGN_IN_OR_RESET_PASSWORD',
  };
}

export function isExistingEmailError(error) {
  return error?.code === 'email_exists';
}

export function existingEmailResponse() {
  return {
    error: 'This email is already registered. Sign in, or reset your password if you have forgotten it.',
    code: 'EMAIL_ALREADY_REGISTERED',
    recovery: 'SIGN_IN_OR_RESET_PASSWORD',
  };
}

// New-signup notifications go to the Proto team. The old default pointed at
// orders@prototrading.co.za — a different domain from the one Proto is
// migrating to — so trade applications could land in a mailbox nobody reads.
const ADMIN_SIGNUP_RECIPIENTS = (process.env.SIGNUP_NOTIFY_EMAILS
  || 'online@proto.co.za,george@proto.co.za,danieljoffeinfo@gmail.com')
  .split(',').map((part) => part.trim()).filter(Boolean);

function caps(value) {
  return String(value || '').trim().toUpperCase();
}

function buildAdminSignupHtml({
  contactName,
  businessName,
  email,
  phone,
  companyAddress,
  deliveryAddress,
  streetName,
  suburb,
  postalCode,
  buildingType,
  unitNumber,
  country,
  province,
  city,
  businessType,
  businessDescription,
  customerCode,
  vatNumber,
  monthlySpend,
  website,
  acceptWhatsapp,
}) {
  const waLabel = acceptWhatsapp === true ? 'YES' : acceptWhatsapp === false ? 'NO' : 'NOT ANSWERED';
  const rows = [
    ['Contact', caps(contactName)],
    ['Business', caps(businessName)],
    ['Email', caps(email)],
    ['Phone', caps(phone)],
    ['WhatsApp opt-in', waLabel],
    ['VAT number', caps(vatNumber)],
    ['Website / social', caps(website)],
    ['Monthly spend', caps(monthlySpend)],
    ['Billing address', caps(companyAddress)],
    ['Delivery address', caps(deliveryAddress)],
    ['Street', caps(streetName)],
    ['Suburb', caps(suburb)],
    ['Postal code', caps(postalCode)],
    ['Building type', caps(buildingType)],
    ['Unit number', caps(unitNumber)],
    ['Country', caps(country)],
    ['Province', caps(province)],
    ['City', caps(city)],
    ['Business type', caps(businessType)],
    ['Business description', String(businessDescription || '').trim()],
    ['Customer code', caps(customerCode)],
  ].filter(([, value]) => value);

  const body = rows.map(([label, value]) => (
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;width:180px;">${escapeHtml(label)}</td>`
    + `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td></tr>`
  )).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;">
      <h2>New trade registration — delivery details</h2>
      <p>A customer signed up on the trade portal. Delivery details below are stored in CAPS for the admin dashboard.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${body}</table>
    </div>
  `;
}

async function sendAdminSignupEmail(payload) {
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
        to: ADMIN_SIGNUP_RECIPIENTS.map((email) => ({ email })),
        subject: `New trade signup — ${caps(payload.businessName || payload.contactName || 'CUSTOMER')}`,
        htmlContent: buildAdminSignupHtml(payload),
      }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.error('Admin signup email Brevo error:', resp.status, JSON.stringify(body));
    }
  } catch (err) {
    console.error('Admin signup email error:', err.message);
  }
}

// Basic RFC-ish format check + common throwaway/dummy domains
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const BLOCKED_EMAIL_DOMAINS = new Set([
  'test.com', 'test.co.za', 'example.com', 'example.org', 'email.com',
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org',
  '10minutemail.com', 'yopmail.com', 'trashmail.com', 'fakeinbox.com',
  'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
]);
const BLOCKED_LOCAL_PARTS = new Set(['test', 'asdf', 'abc', 'fake', 'dummy', 'noreply', 'no-reply']);

export function validateEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Please enter your email address.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address (e.g. name@company.co.za).' };
  const [local, domain] = email.split('@');
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return { ok: false, error: 'Please use your real business email address — temporary or test addresses are not accepted.' };
  }
  if (BLOCKED_LOCAL_PARTS.has(local) && (domain === 'test.com' || BLOCKED_EMAIL_DOMAINS.has(domain))) {
    return { ok: false, error: 'Please use your real business email address.' };
  }
  return { ok: true, email };
}

const WELCOME_HTML = (name) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Welcome to Proto Trading Online</title></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 12px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#111111;border-radius:18px;overflow:hidden;border:1px solid #2a2a2a;box-shadow:0 18px 50px rgba(0,0,0,0.55);">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:38px 34px 30px;background:#141414;">
  <div style="display:inline-block;background:#ffffff;padding:14px 22px;border-radius:8px;margin-bottom:26px;">
    <span style="font-size:30px;font-weight:900;color:#c40000;letter-spacing:1px;">PROTO</span>
    <span style="font-size:20px;font-weight:800;color:#222222;letter-spacing:0.5px;"> TRADING</span>
  </div>
  <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:900;letter-spacing:-0.4px;">Application received</h1>
  <p style="margin:12px 0 0;color:#cfcfcf;font-size:15px;line-height:1.6;">Your trade account application is under review</p>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;line-height:1.6;font-weight:700;">Hi ${escapeHtml(name, 'there')},</p>
  <p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">Thank you for applying for a trade account with Proto Trading Online. We have received your application and our team will review and approve your request within 24 hours.</p>
  <p style="margin:0 0 30px;color:#444444;font-size:16px;line-height:1.7;">Once your account is approved we'll email you to confirm — from that moment you can log in and access our full wholesale catalogue, live stock availability, and trade pricing.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:12px;border-left:5px solid #c40000;margin-bottom:32px;">
    <tr><td style="padding:22px 24px;">
      <p style="margin:0 0 14px;color:#111111;font-size:15px;font-weight:800;">What you get as a trade account holder:</p>
      <p style="margin:0 0 8px;color:#444444;font-size:14px;line-height:1.7;">&#10003; &nbsp;Access to our full wholesale catalogue</p>
      <p style="margin:0 0 8px;color:#444444;font-size:14px;line-height:1.7;">&#10003; &nbsp;Live stock availability on every product</p>
      <p style="margin:0 0 8px;color:#444444;font-size:14px;line-height:1.7;">&#10003; &nbsp;Trade pricing exclusive to account holders</p>
      <p style="margin:0;color:#444444;font-size:14px;line-height:1.7;">&#10003; &nbsp;Fast order requests directly from the portal</p>
    </td></tr>
  </table>
  <p style="margin:0;color:#666666;font-size:13px;line-height:1.6;">If you have any questions, please contact us at <a href="mailto:online@proto.co.za" style="color:#c40000;">online@proto.co.za</a> or call <a href="tel:+27214615883" style="color:#c40000;">+27 21 461 5883</a>.</p>
</td></tr>
<tr><td align="center" style="padding:30px 34px;background:#181818;border-top:1px solid #292929;">
  <p style="margin:0 0 8px;color:#ffffff;font-size:18px;font-weight:900;">Proto Trading Online</p>
  <p style="margin:0 0 12px;color:#cfcfcf;font-size:14px;line-height:1.7;">
    <a href="tel:+27214615883" style="color:#ff3333;text-decoration:none;font-weight:700;">+27 21 461 5883</a>
    <span style="color:#777777;"> &nbsp;|&nbsp; </span>
    <a href="mailto:online@proto.co.za" style="color:#ff3333;text-decoration:none;font-weight:700;">online@proto.co.za</a>
  </p>
  <p style="margin:0;color:#a9a9a9;font-size:13px;line-height:1.6;">De Roos Street, off Sir Lowry Road, District Six, Cape Town, South Africa</p>
</td></tr>
<tr><td style="background:#c40000;padding:34px;">
  <div style="display:inline-block;background:#ffffff;padding:12px 18px;border-radius:6px;margin-bottom:24px;">
    <span style="font-size:25px;font-weight:900;color:#c40000;letter-spacing:1px;">PROTO</span>
    <span style="font-size:17px;font-weight:800;color:#222222;"> TRADING</span>
  </div>
  <p style="margin:0 0 22px;color:#ffffff;font-size:14px;font-weight:800;line-height:1.5;">🌲 Before printing, please think about the Environment</p>
  <p style="margin:0;color:#ffffff;font-size:12.5px;line-height:1.8;">Please note that Internet communications are not secure and therefore Proto Trading does not accept legal responsibility for the contents of this message.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

const APPROVED_HTML = (name) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your Proto Trading account is ready</title></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 12px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#111111;border-radius:18px;overflow:hidden;border:1px solid #2a2a2a;">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:38px 34px 30px;background:#141414;">
  <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:900;">You're approved</h1>
  <p style="margin:12px 0 0;color:#cfcfcf;font-size:15px;line-height:1.6;">Your trade account is approved</p>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;line-height:1.6;font-weight:700;">Hi ${escapeHtml(name, 'there')},</p>
  <p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">Great news — your Proto Trading Online trade account has been approved. You can log in now to browse the full wholesale catalogue, live stock and trade pricing, and place orders online.</p>
  <p style="margin:0 0 24px;">
    <a href="${PUBLIC_SITE_URL}" style="display:inline-block;background:#c40000;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;">Log in to the trade portal</a>
  </p>
  <p style="margin:0;color:#666666;font-size:13px;line-height:1.6;">Questions? <a href="mailto:online@proto.co.za" style="color:#c40000;">online@proto.co.za</a> · <a href="tel:+27214615883" style="color:#c40000;">+27 21 461 5883</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    email,
    password,
    confirmPassword,
    contactName,
    businessName,
    phone,
    companyAddress,
    deliveryAddress,
    vatNumber,
    country,
    province,
    city,
    businessType,
    businessDescription,
    monthlySpend,
    website,
    acceptWhatsapp,
    customerCode,
    company_fax,
    streetName,
    suburb,
    postalCode,
    buildingType,
    unitNumber,
  } = req.body || {};

  // Honeypot — bots that fill hidden fields get a fake success response.
  if (company_fax) {
    return res.status(200).json({ ok: true, instantAccess: true, customerCode: 'XXXXXX' });
  }

  if (!email || !password || !contactName || !businessName || !phone || !companyAddress || !deliveryAddress) {
    return res.status(400).json({ error: 'Please complete all required fields' });
  }

  if (!String(businessType || '').trim()) {
    return res.status(400).json({ error: 'Please select at least one nature of business option.' });
  }

  const normalizedBusinessDescription = String(businessDescription || '').trim().slice(0, 400);
  if (normalizedBusinessDescription.length < 20) {
    return res.status(400).json({ error: 'Please describe your business in at least 20 characters.' });
  }

  // Throttling: registration creates an auth account and sends emails, so it
  // must not be scriptable into mass abuse — but South African mobile carriers
  // put THOUSANDS of customers behind one CGNAT IP, so a tight per-IP cap
  // rejects real signups on a busy day. Per-IP stays generous; the per-EMAIL
  // bucket below is what stops someone hammering a single address.
  const rl = await checkRateLimit({ bucket: `register-trade:${clientIp(req)}`, max: 30, windowSeconds: 3600 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60));
    return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
  }
  const emailForLimit = String(email || '').trim().toLowerCase();
  if (emailForLimit) {
    const rlEmail = await checkRateLimit({ bucket: `register-trade-email:${emailForLimit}`, max: 3, windowSeconds: 3600 });
    if (!rlEmail.allowed) {
      res.setHeader('Retry-After', String(rlEmail.retryAfter || 60));
      return res.status(429).json({ error: 'Too many registration attempts for this email. Please try again later.' });
    }
  }

  if (confirmPassword && String(password) !== String(confirmPassword)) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const emailCheck = validateEmail(email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.error });
  }

  const passwordError = passwordPolicyError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const normalizedEmail = emailCheck.email;
  const normalizedContactName = contactName.trim();
  const normalizedBusinessName = businessName.trim();
  const normalizedPhone = phone.trim();
  const normalizedCompanyAddress = companyAddress.trim();
  const normalizedDeliveryAddress = caps(deliveryAddress);
  const normalizedStreetName = caps(streetName);
  const normalizedSuburb = caps(suburb);
  const normalizedPostalCode = caps(postalCode);
  const normalizedBuildingType = caps(buildingType);
  const normalizedUnitNumber = caps(unitNumber);
  const normalizedVatNumber = vatNumber?.trim() || null;
  // Keep the code the applicant supplied separate from the customer code that
  // Proto eventually allocates. It is evidence for reconciliation only and
  // must never grant access or become the account's live customer_code.
  const claimedCustomerCode = caps(customerCode) || null;

  let protoActiveMatch = null;
  let protoActive = null;
  try {
    protoActiveMatch = await lookupProtoActiveCustomer(supabase, normalizedEmail, customerCode);
    protoActive = protoActiveMatch.row;
  } catch (lookupErr) {
    console.warn('proto_active_customers lookup:', lookupErr?.message || lookupErr);
  }
  const isProtoActive = isVerifiedProtoActiveMatch(protoActiveMatch);

  // No email-confirmation step: accounts are created with the address already
  // marked confirmed. Access is gated by ADMIN APPROVAL instead — an applicant
  // lands in trade requests and cannot reach the catalogue until an admin
  // approves them, so the mailbox round-trip adds nothing here.
  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      name: normalizedContactName,
      phone: normalizedPhone,
      business_name: normalizedBusinessName,
      company_address: normalizedCompanyAddress,
      delivery_address: normalizedDeliveryAddress,
      vat_number: normalizedVatNumber,
      country: country || null,
      province: province || null,
      city: city || null,
      business_type: businessType || null,
      business_description: normalizedBusinessDescription,
      monthly_spend: monthlySpend || null,
      website: website || null,
    },
  });

  if (error) {
    console.error('createUser error:', error);
    // Supabase exposes the stable `email_exists` Auth error code. Customers
    // expect a clear answer for this ordinary registration case; keep every
    // other account-creation failure generic and never echo provider messages.
    if (isExistingEmailError(error)) {
      return res.status(409).json(existingEmailResponse());
    }
    return res.status(400).json(accountCreationFailureResponse());
  }

  const userId = data.user?.id;
  let profileVerification = null;
  let allocatedCustomerCode = null;

  // Immediate access is a server decision: only a customer's registered email
  // may match the historic Proto customer register. A submitted customer code
  // can support later reconciliation but cannot grant access by itself.
  const shouldApprove = isProtoActive;

  if (userId) {
    // Customer codes are NEVER auto-generated — they are allocated manually in
    // the admin dashboard, whenever the admin is ready. Approval does not
    // require a code. (Was: allocateCustomerCode for approved/10000-club
    // signups, which contradicted that rule.)
    allocatedCustomerCode = null;

    const fullPayload = {
      id: userId,
      email: normalizedEmail,
      name: normalizedContactName,
      contact_name: protoActive?.contact_name || normalizedContactName,
      first_name: protoActive?.first_name || normalizedContactName.split(/\s+/)[0] || null,
      phone: normalizedPhone,
      business_name: (isProtoActive && protoActive?.name) ? protoActive.name : normalizedBusinessName,
      company_address: normalizedCompanyAddress,
      delivery_address: normalizedDeliveryAddress,
      street_name: normalizedStreetName || null,
      suburb: normalizedSuburb || null,
      postal_code: normalizedPostalCode || null,
      building_type: normalizedBuildingType || null,
      unit_number: normalizedUnitNumber || null,
      vat_number: normalizedVatNumber,
      country: country || null,
      province: province || null,
      city: city || null,
      business_type: businessType || null,
      business_description: normalizedBusinessDescription,
      monthly_spend: monthlySpend || null,
      website: website || null,
      claimed_customer_code: claimedCustomerCode,
      accept_whatsapp: typeof acceptWhatsapp === 'boolean' ? acceptWhatsapp : null,
      whatsapp_opt_in_at: acceptWhatsapp === true ? new Date().toISOString() : null,
      is_approved: shouldApprove,
      customer_code: allocatedCustomerCode,
      sales_last_12_months: isProtoActive ? Number(protoActive.sales_last_12_months) || 0 : null,
      invoice_count: isProtoActive ? Number(protoActive.invoice_count) || 0 : null,
      last_purchase_date: isProtoActive ? protoActive.last_purchase_date : null,
      tier: 'regular',
    };

    const {
      company_address: _ca,
      street_name: _sn,
      suburb: _su,
      postal_code: _pc,
      building_type: _btp,
      unit_number: _un,
      vat_number: _vn,
      business_name: _bn,
      country: _co,
      province: _pr,
      city: _ci,
      business_type: _bt,
      business_description: _bd,
      customer_code: _cc,
      sales_last_12_months: _sl,
      invoice_count: _ic,
      last_purchase_date: _lp,
      contact_name: _cn,
      first_name: _fn,
    } = fullPayload;

    const basePayload = Object.fromEntries(
      Object.entries(fullPayload).filter(([key]) => ![
        'accept_whatsapp',
        'whatsapp_opt_in_at',
        'monthly_spend',
        'website',
        'company_address',
        'street_name',
        'suburb',
        'postal_code',
        'building_type',
        'unit_number',
        'vat_number',
        'business_name',
        'country',
        'province',
        'city',
        'business_type',
        'business_description',
        'customer_code',
        'sales_last_12_months',
        'invoice_count',
        'last_purchase_date',
        'contact_name',
        'first_name',
        'claimed_customer_code',
      ].includes(key)),
    );
    const payloadWithoutNewColumns = Object.fromEntries(
      Object.entries(fullPayload).filter(([key]) => !['claimed_customer_code', 'business_description'].includes(key)),
    );

    const upsertAttempts = [
      fullPayload,
      Object.fromEntries(Object.entries(fullPayload).filter(([key]) => key !== 'claimed_customer_code')),
      Object.fromEntries(Object.entries(fullPayload).filter(([key]) => key !== 'business_description')),
      payloadWithoutNewColumns,
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt, business_description: _bd, company_address: _ca, street_name: _sn, suburb: _su, postal_code: _pc, building_type: _btp, unit_number: _un, vat_number: _vn, customer_code: _cc, sales_last_12_months: _sl, invoice_count: _ic, last_purchase_date: _lp, contact_name: _cn, first_name: _fn },
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt, company_address: _ca, vat_number: _vn, customer_code: _cc, sales_last_12_months: _sl, invoice_count: _ic, last_purchase_date: _lp, contact_name: _cn, first_name: _fn },
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt, company_address: _ca, vat_number: _vn },
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt },
      basePayload,
    ];

    let custError = null;
    for (const [i, payload] of upsertAttempts.entries()) {
      const { error: upsertError } = await supabase.from('customers').upsert(payload, { onConflict: 'id' });
      if (!upsertError) {
        custError = null;
        break;
      }
      custError = upsertError;
      if (i < upsertAttempts.length - 1) {
        console.warn(`customers upsert attempt ${i + 1} failed, retrying with reduced payload:`, upsertError.message);
      }
    }

    if (custError) {
      console.error('customers upsert error:', custError.message, '| userId:', userId, '| email:', normalizedEmail);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Failed to create customer profile. Please try again.' });
    }

    const { data: savedProfile } = await supabase
      .from('customers')
      .select('id, email, accept_whatsapp, customer_code, is_approved')
      .eq('id', userId)
      .single();
    if (!savedProfile) {
      console.error('customer profile verification failed — row missing after upsert | userId:', userId);
    }
    profileVerification = savedProfile || null;
    if (savedProfile?.customer_code) {
      allocatedCustomerCode = savedProfile.customer_code;
    }

    // (No verification email — see the createUser call above. Access is gated by
    // admin approval, not by an email round-trip.)

    await sendAdminSignupEmail({
      contactName: normalizedContactName,
      businessName: normalizedBusinessName,
      email: normalizedEmail,
      phone: normalizedPhone,
      companyAddress: normalizedCompanyAddress,
      deliveryAddress: normalizedDeliveryAddress,
      streetName: normalizedStreetName,
      suburb: normalizedSuburb,
      postalCode: normalizedPostalCode,
      buildingType: normalizedBuildingType,
      unitNumber: normalizedUnitNumber,
      country,
      province,
      city,
      businessType,
      businessDescription: normalizedBusinessDescription,
      customerCode: claimedCustomerCode,
      vatNumber: normalizedVatNumber,
      monthlySpend: monthlySpend || null,
      website: website || null,
      acceptWhatsapp: typeof acceptWhatsapp === 'boolean' ? acceptWhatsapp : null,
    });
  }

  if (process.env.BREVO_API_KEY) {
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
          to: [{ email: normalizedEmail }],
          subject: shouldApprove
            // No "verify your email" — email confirmation was removed; the
            // account is usable the moment it is approved.
            ? 'Your trade account is approved — Proto Trading'
            : 'We have received your request — you will hear from us within 24 hours',
          htmlContent: shouldApprove
            ? APPROVED_HTML(normalizedContactName || normalizedBusinessName || '')
            : WELCOME_HTML(normalizedContactName || normalizedBusinessName || ''),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.error('Welcome email Brevo error:', resp.status, JSON.stringify(body));
      }
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr.message);
    }
  }

  return res.status(200).json({
    ok: true,
    instantAccess: shouldApprove,
    emailVerificationRequired: true,
    customerCode: allocatedCustomerCode || null,
    profile: profileVerification
      ? {
        id: profileVerification.id,
        acceptWhatsapp: profileVerification.accept_whatsapp,
        customerCode: profileVerification.customer_code || allocatedCustomerCode,
      }
      : null,
  });
}

import { createClient } from '@supabase/supabase-js';
import { escapeHtml } from './_escape-html.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { sendTradeVerificationEmail } from './_trade-email-verification.js';
import { passwordPolicyError } from '../src/lib/passwordPolicy.js';

const BREVO_SENDER = {
  name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
  email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
};

const VALID_TRADING_CHANNELS = new Set([
  'Physical retail store',
  'Online shop / e-commerce',
  'Market trader / spaza shop',
  'Wholesaler',
  'Importer / distributor',
  'School, church or institution',
  'Events / service business',
]);

const VALID_PRODUCT_CATEGORIES = new Set([
  'Art, craft & beads',
  'Stationery & educational products',
  'Gifts & novelty products',
  'Homeware & kitchenware',
  'Fashion & accessories',
  'Beauty & personal care',
  'Party, events & packaging',
  'Toys, baby & children',
  'Hardware',
  'Food & drinks',
  'Pet products',
  'Promotional products',
  'General merchandise / variety',
  'Other',
]);

function normalizeSelections(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item || '').trim().slice(0, 80))
    .filter((item) => item && allowed.has(item)))]
    .slice(0, 20);
}

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
// danieljoffeinfo@gmail.com was removed by request — Daniel keeps the ORDER
// alerts (a separate list, api/_order-alert-recipients.js in the admin) but no
// longer wants a mail for every trade signup.
const ADMIN_SIGNUP_RECIPIENTS = (process.env.SIGNUP_NOTIFY_EMAILS
  || 'online@proto.co.za,george@proto.co.za')
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
  salesChannels,
  productCategories,
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
    ['How they trade', salesChannels?.join(', ')],
    ['What they sell', productCategories?.join(', ')],
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

export function createRegisterTradeHandler({
  createServiceClient = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }),
  rateLimit = checkRateLimit,
  sendVerification = sendTradeVerificationEmail,
  sendAdmin = sendAdminSignupEmail,
} = {}) {
return async function handler(req, res) {
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
    salesChannels,
    productCategories,
    otherProductCategory,
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

  const normalizedSalesChannels = normalizeSelections(salesChannels, VALID_TRADING_CHANNELS);
  const selectedProductCategories = normalizeSelections(productCategories, VALID_PRODUCT_CATEGORIES);
  const normalizedOtherProductCategory = String(otherProductCategory || '').trim().slice(0, 80);
  const normalizedProductCategories = selectedProductCategories
    .map((category) => (category === 'Other' ? normalizedOtherProductCategory : category))
    .filter(Boolean);

  if (normalizedSalesChannels.length === 0) {
    return res.status(400).json({ error: 'Please select at least one way that you trade.' });
  }
  if (selectedProductCategories.length === 0) {
    return res.status(400).json({ error: 'Please select at least one product category.' });
  }
  if (selectedProductCategories.includes('Other') && !normalizedOtherProductCategory) {
    return res.status(400).json({ error: 'Please name the other product category.' });
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
  const rl = await rateLimit({ bucket: `register-trade:${clientIp(req)}`, max: 30, windowSeconds: 3600 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60));
    return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
  }
  const emailForLimit = String(email || '').trim().toLowerCase();
  if (emailForLimit) {
    const rlEmail = await rateLimit({ bucket: `register-trade-email:${emailForLimit}`, max: 3, windowSeconds: 3600 });
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
  if (!process.env.BREVO_API_KEY) return res.status(503).json({ error: 'Registration email is temporarily unavailable. Please try again later.' });

  const supabase = createServiceClient();

  const normalizedEmail = emailCheck.email;
  // Fail before creating an Auth account if the matching security migration
  // has not been applied. Never fall back to an unguarded legacy schema.
  const securitySchema = await supabase.from('customers')
    .select('trade_email_verification_required, trade_email_verified_at').limit(0);
  if (securitySchema.error) return res.status(503).json({ error: 'Registration is temporarily unavailable. Please try again later.' });
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

  // A legacy email match is eligibility, not identity. The mailbox must be
  // confirmed through the one-time verification callback before access.
  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: false,
    app_metadata: { trade_email_verification_required: true },
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
      sales_channels: normalizedSalesChannels,
      product_categories: normalizedProductCategories,
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

  const shouldApprove = false;

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
      contact_name: normalizedContactName,
      first_name: normalizedContactName.split(/\s+/)[0] || null,
      phone: normalizedPhone,
      business_name: normalizedBusinessName,
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
      sales_channels: normalizedSalesChannels,
      product_categories: normalizedProductCategories,
      business_description: normalizedBusinessDescription,
      monthly_spend: monthlySpend || null,
      website: website || null,
      claimed_customer_code: claimedCustomerCode,
      accept_whatsapp: typeof acceptWhatsapp === 'boolean' ? acceptWhatsapp : null,
      whatsapp_opt_in_at: acceptWhatsapp === true ? new Date().toISOString() : null,
      is_approved: shouldApprove,
      trade_email_verification_required: true,
      customer_code: allocatedCustomerCode,
      sales_last_12_months: null,
      invoice_count: null,
      last_purchase_date: null,
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
      sales_channels: _sc,
      product_categories: _pcat,
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
        'sales_channels',
        'product_categories',
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
      Object.entries(fullPayload).filter(([key]) => !['claimed_customer_code', 'business_description', 'sales_channels', 'product_categories'].includes(key)),
    );
    const payloadWithoutClassification = Object.fromEntries(
      Object.entries(fullPayload).filter(([key]) => !['sales_channels', 'product_categories'].includes(key)),
    );

    const upsertAttempts = [
      fullPayload,
      payloadWithoutClassification,
      Object.fromEntries(Object.entries(fullPayload).filter(([key]) => !['claimed_customer_code', 'sales_channels', 'product_categories'].includes(key))),
      Object.fromEntries(Object.entries(fullPayload).filter(([key]) => !['business_description', 'sales_channels', 'product_categories'].includes(key))),
      payloadWithoutNewColumns,
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt, sales_channels: _sc, product_categories: _pcat, business_description: _bd, company_address: _ca, street_name: _sn, suburb: _su, postal_code: _pc, building_type: _btp, unit_number: _un, vat_number: _vn, customer_code: _cc, sales_last_12_months: _sl, invoice_count: _ic, last_purchase_date: _lp, contact_name: _cn, first_name: _fn },
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

    // Verification is sent below after the profile is safely persisted.

    await sendAdmin({
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
      salesChannels: normalizedSalesChannels,
      productCategories: normalizedProductCategories,
      businessDescription: normalizedBusinessDescription,
      customerCode: claimedCustomerCode,
      vatNumber: normalizedVatNumber,
      monthlySpend: monthlySpend || null,
      website: website || null,
      acceptWhatsapp: typeof acceptWhatsapp === 'boolean' ? acceptWhatsapp : null,
    });
  }

  let verificationEmailSent = false;
  if (process.env.BREVO_API_KEY && userId) {
    try {
      const verification = await sendVerification({ client: supabase, userId, email: normalizedEmail, name: normalizedContactName });
      verificationEmailSent = verification.sent;
    } catch {
      console.error('Registration verification email could not be sent');
    }
  }

  return res.status(200).json({
    ok: true,
    instantAccess: shouldApprove,
    emailVerificationRequired: true,
    verificationEmailSent,
    customerCode: allocatedCustomerCode || null,
    profile: profileVerification
      ? {
        id: profileVerification.id,
        acceptWhatsapp: profileVerification.accept_whatsapp,
        customerCode: profileVerification.customer_code || allocatedCustomerCode,
      }
      : null,
  });
};
}

export default createRegisterTradeHandler();

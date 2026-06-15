import { createClient } from '@supabase/supabase-js';
import { escapeHtml } from './_escape-html.js';
import { normalizeWhatsapp } from './_wati-notify.js';

const BREVO_SENDER = {
  name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
  email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
};

// Basic RFC-ish format check + common throwaway/dummy domains
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const BLOCKED_EMAIL_DOMAINS = new Set([
  'test.com', 'test.co.za', 'example.com', 'example.org', 'email.com',
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org',
  '10minutemail.com', 'yopmail.com', 'trashmail.com', 'fakeinbox.com',
  'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
]);
const BLOCKED_LOCAL_PARTS = new Set(['test', 'asdf', 'abc', 'fake', 'dummy', 'noreply', 'no-reply']);

const PROTO_ACTIVE_SELECT = 'id, account_code, name, contact_name, first_name, email, sales_last_12_months, invoice_count, last_purchase_date';

async function findProtoActiveCustomer(supabase, email, customerCode) {
  const normalizedCode = customerCode
    ? String(customerCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    : '';

  if (email) {
    const { data } = await supabase
      .from('proto_active_customers')
      .select(PROTO_ACTIVE_SELECT)
      .eq('email', email)
      .maybeSingle();
    if (data) return { row: data, emailUpdated: false };
  }

  if (normalizedCode && /^[A-Z0-9]{6}$/.test(normalizedCode)) {
    const { data: matches } = await supabase
      .from('proto_active_customers')
      .select(PROTO_ACTIVE_SELECT)
      .eq('account_code', normalizedCode)
      .order('sales_last_12_months', { ascending: false })
      .limit(1);
    const data = matches?.[0] ?? null;
    if (!data) return { row: null, emailUpdated: false };

    if (email && data.email !== email) {
      const { error } = await supabase
        .from('proto_active_customers')
        .update({ email })
        .eq('id', data.id);
      if (error) {
        console.warn('proto_active email update failed:', error.message);
        return { row: data, emailUpdated: false };
      }
      return { row: { ...data, email }, emailUpdated: true };
    }
    return { row: data, emailUpdated: false };
  }

  return { row: null, emailUpdated: false };
}

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
  <p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">Thank you for applying for a trade account with Proto Trading Online. We have received your application and our team will review it shortly.</p>
  <p style="margin:0 0 30px;color:#444444;font-size:16px;line-height:1.7;">Once your account is approved, you will receive a follow-up email and can log in to access our full wholesale catalogue, live stock availability, and trade pricing.</p>
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
  <p style="margin:12px 0 0;color:#cfcfcf;font-size:15px;line-height:1.6;">Your trade account is live — log in now</p>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;line-height:1.6;font-weight:700;">Hi ${escapeHtml(name, 'there')},</p>
  <p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">Your email is on our active trade customer list. Your account has been approved automatically — you can log in right away to browse the wholesale catalogue, live stock, and trade pricing.</p>
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
    monthlySpend,
    website,
    acceptWhatsapp,
    customerCode,
  } = req.body || {};

  if (!email || !password || !contactName || !businessName || !phone || !companyAddress || !deliveryAddress) {
    return res.status(400).json({ error: 'Please complete all required fields' });
  }

  const emailCheck = validateEmail(email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.error });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

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
  const normalizedDeliveryAddress = deliveryAddress.trim();
  const normalizedVatNumber = vatNumber?.trim() || null;

  let protoActive = null;
  try {
    const match = await findProtoActiveCustomer(supabase, normalizedEmail, customerCode);
    protoActive = match.row;
    if (match.emailUpdated) {
      console.info('proto_active email updated for code', protoActive?.account_code, '→', normalizedEmail);
    }
  } catch (lookupErr) {
    console.warn('proto_active_customers lookup:', lookupErr?.message || lookupErr);
  }
  const isProtoActive = Boolean(protoActive?.account_code);

  // Create the user via admin API — skips Supabase's own confirmation email
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
      monthly_spend: monthlySpend || null,
      website: website || null,
    },
  });

  if (error) {
    console.error('createUser error:', error);
    return res.status(400).json({ error: error.message });
  }

  // Insert customers row manually (in case the DB trigger doesn't fire for admin-created users)
  const userId = data.user?.id;
  let profileVerification = null;
  if (userId) {
    // Try full payload first; if accept_whatsapp column doesn't exist yet, fall back without it
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
      vat_number: normalizedVatNumber,
      country: country || null,
      province: province || null,
      city: city || null,
      business_type: businessType || null,
      monthly_spend: monthlySpend || null,
      website: website || null,
      accept_whatsapp: typeof acceptWhatsapp === 'boolean' ? acceptWhatsapp : null,
      whatsapp_opt_in_at: acceptWhatsapp === true ? new Date().toISOString() : null,
      is_approved: isProtoActive,
      customer_code: isProtoActive ? String(protoActive.account_code).toUpperCase().slice(0, 6) : null,
      sales_last_12_months: isProtoActive ? Number(protoActive.sales_last_12_months) || 0 : null,
      invoice_count: isProtoActive ? Number(protoActive.invoice_count) || 0 : null,
      last_purchase_date: isProtoActive ? protoActive.last_purchase_date : null,
      tier: 'regular',
    };

    const {
      accept_whatsapp: _wa,
      whatsapp_opt_in_at: _waAt,
      monthly_spend: _ms,
      website: _wb,
      company_address: _ca,
      vat_number: _vn,
      business_name: _bn,
      country: _co,
      province: _pr,
      city: _ci,
      business_type: _bt,
      customer_code: _cc,
      sales_last_12_months: _sl,
      invoice_count: _ic,
      last_purchase_date: _lp,
      contact_name: _cn,
      first_name: _fn,
      ...basePayload
    } = fullPayload;

    const upsertAttempts = [
      fullPayload,
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt, company_address: _ca, vat_number: _vn, customer_code: _cc, sales_last_12_months: _sl, invoice_count: _ic, last_purchase_date: _lp, contact_name: _cn, first_name: _fn },
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt, company_address: _ca, vat_number: _vn, customer_code: _cc, sales_last_12_months: _sl, invoice_count: _ic, last_purchase_date: _lp },
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt, company_address: _ca, vat_number: _vn },
      { ...basePayload, business_name: _bn, country: _co, province: _pr, city: _ci, business_type: _bt },
      basePayload,
    ];

    let custError = null;
    for (const [i, payload] of upsertAttempts.entries()) {
      const { error } = await supabase.from('customers').upsert(payload, { onConflict: 'id' });
      if (!error) {
        custError = null;
        break;
      }
      custError = error;
      if (i < upsertAttempts.length - 1) {
        console.warn(`customers upsert attempt ${i + 1} failed, retrying with reduced payload:`, error.message);
      }
    }

    if (custError) {
      console.error('customers upsert error:', custError.message, '| userId:', userId, '| email:', normalizedEmail);
      // Auth user exists but no customer row — clean up to avoid orphaned auth account
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Failed to create customer profile. Please try again.' });
    }

    // Verify the saved row so the client (and logs) can confirm what was stored
    const { data: savedProfile } = await supabase
      .from('customers')
      .select('id, email, accept_whatsapp')
      .eq('id', userId)
      .single();
    if (!savedProfile) {
      console.error('customer profile verification failed — row missing after upsert | userId:', userId);
    }
    profileVerification = savedProfile || null;

    // WhatsApp welcome for opted-in customers (not proto-active allowlist — they default to No)
    if (!isProtoActive && fullPayload.accept_whatsapp === true && normalizedPhone) {
      const watiPhone = normalizeWhatsapp(normalizedPhone);
      const watiBase = process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950';
      const watiToken = process.env.WATI_API_TOKEN;
      if (watiToken && watiPhone) {
        try {
          await fetch(`${watiBase}/api/v1/addContact`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${watiToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: normalizedContactName || normalizedBusinessName || 'Customer',
              phoneNumber: watiPhone,
            }),
          }).catch(() => {});
          const waRes = await fetch(
            `${watiBase}/api/v1/sendTemplateMessage?whatsappNumber=${watiPhone}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${watiToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                template_name: 'proto_welcome_',
                broadcast_name: 'proto_welcome_',
                parameters: [],
              }),
            },
          );
          if (!waRes.ok) {
            const waBody = await waRes.json().catch(() => ({}));
            console.error('WATI send error on signup:', waRes.status, JSON.stringify(waBody));
          }
        } catch (waErr) {
          console.error('WATI signup error:', waErr.message);
        }
      }
    }
  }

  // Send branded welcome email via Brevo REST API
  if (process.env.BREVO_API_KEY) {
    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: BREVO_SENDER,
          to: [{ email: normalizedEmail }],
          subject: isProtoActive
            ? 'Your Proto Trading trade account is ready — log in now'
            : 'We have received your request — you will hear from us within 24 hours',
          htmlContent: isProtoActive
            ? APPROVED_HTML(normalizedContactName || normalizedBusinessName || '')
            : WELCOME_HTML(normalizedContactName || normalizedBusinessName || ''),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.error('Welcome email Brevo error:', resp.status, JSON.stringify(body));
      }
    } catch (emailErr) {
      // Don't fail the registration if email sending fails
      console.error('Welcome email error:', emailErr.message);
    }
  }

  return res.status(200).json({
    ok: true,
    instantAccess: isProtoActive,
    profile: profileVerification
      ? { id: profileVerification.id, acceptWhatsapp: profileVerification.accept_whatsapp }
      : null,
  });
}

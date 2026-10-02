import {
  findUserByEmail,
  getResetSecret,
  getResetTokenVersion,
  getServiceClient,
  makeResetToken,
} from './_password-reset.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { PUBLIC_SITE_URL } from './_public-site-url.js';

export const RESET_HTML = (link) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>Reset your Proto Trading password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your secure Proto Trading password reset link expires in 15 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f4f6;border-collapse:collapse;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-collapse:separate;border-spacing:0;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
<tr><td style="height:5px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:30px 32px 28px;background:#111111;">
  <p style="margin:0 0 22px;color:#ffffff;font-size:22px;line-height:1.1;font-weight:900;letter-spacing:0.4px;">PROTO <span style="color:#ef2b2d;">TRADING</span><span style="display:block;margin-top:6px;color:#b8b8b8;font-size:10px;line-height:1.2;font-weight:700;letter-spacing:3px;">ONLINE</span></p>
  <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.25;font-weight:900;letter-spacing:-0.3px;">Reset your password</h1>
  <p style="margin:10px 0 0;color:#d1d5db;font-size:14px;line-height:1.6;">Secure access to your Proto Trading Online account</p>
</td></tr>
<tr><td style="padding:36px 34px 32px;background:#ffffff;">
  <p style="margin:0 0 16px;color:#111827;font-size:18px;line-height:1.5;font-weight:700;">Hi there,</p>
  <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">We received a request to reset the password for your Proto Trading Online account.</p>
  <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.7;">Use the secure button below to choose a new password.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 28px;border-collapse:collapse;"><tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
      <td align="center" bgcolor="#c40000" style="background:#c40000;border-radius:8px;mso-padding-alt:15px 34px;">
        <a href="${link}" style="display:block;padding:15px 34px;border:1px solid #c40000;border-radius:8px;color:#ffffff;text-decoration:none;font-size:16px;line-height:20px;font-weight:800;text-align:center;">Reset my password</a>
      </td>
    </tr></table>
  </td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 26px;background:#fff7f7;border:1px solid #fecaca;border-left:4px solid #c40000;border-collapse:separate;border-spacing:0;border-radius:8px;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0 0 4px;color:#7f1d1d;font-size:14px;line-height:1.5;font-weight:800;">Secure, single-use link</p>
      <p style="margin:0;color:#7f1d1d;font-size:13px;line-height:1.65;">This link expires in 15 minutes and can only be used once.</p>
    </td></tr>
  </table>
  <p style="margin:0 0 6px;color:#374151;font-size:13px;line-height:1.6;font-weight:700;">Didn&rsquo;t request this?</p>
  <p style="margin:0 0 26px;color:#6b7280;font-size:13px;line-height:1.65;">You can safely ignore this email. Your password will not change unless the secure link is used.</p>
  <p style="margin:0 0 8px;color:#6b7280;font-size:12px;line-height:1.6;">If the button does not work, copy and paste this address into your browser:</p>
  <p style="margin:0;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:7px;word-break:break-all;font-size:11px;line-height:1.6;"><a href="${link}" style="color:#9f1239;text-decoration:underline;">${link}</a></p>
</td></tr>
<tr><td align="center" style="padding:24px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
  <p style="margin:0 0 7px;color:#111827;font-size:15px;line-height:1.5;font-weight:800;">Proto Trading Online</p>
  <p style="margin:0 0 8px;color:#6b7280;font-size:12px;line-height:1.7;">
    <a href="tel:+27214615883" style="color:#9f1239;text-decoration:none;font-weight:700;">+27 21 461 5883</a>
    <span style="color:#d1d5db;"> &nbsp;&bull;&nbsp; </span>
    <a href="mailto:online@proto.co.za" style="color:#9f1239;text-decoration:none;font-weight:700;">online@proto.co.za</a>
  </p>
  <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">De Roos Street, District Six, Cape Town, South Africa</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

// Identical response for every input â€” no account-existence oracle.
const GENERIC_OK = { ok: true };
const GENERIC_RESPONSE_FLOOR_MS = 1400;

async function waitForGenericResponse(startedAt) {
  // Existing accounts do extra Supabase and email-provider work. A fixed floor
  // plus small jitter makes the public response timing much less useful as an
  // account-existence oracle while the visible response remains identical.
  const targetMs = GENERIC_RESPONSE_FLOOR_MS + Math.floor(Math.random() * 251);
  const remainingMs = targetMs - (Date.now() - startedAt);
  if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingMs));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const startedAt = Date.now();

  const email = String(req.body?.email || '').trim().toLowerCase();

  const secret = getResetSecret();
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' });
  if (!process.env.BREVO_API_KEY) {
    console.error('BREVO_API_KEY not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  // Rate limit per IP and per email (fixed 1h window). Generic 429 either way.
  const ip = clientIp(req);
  const ipLimit = await checkRateLimit({ bucket: `reset:ip:${ip}`, max: 10, windowSeconds: 3600 });
  const emailLimit = email
    ? await checkRateLimit({ bucket: `reset:email:${email}`, max: 5, windowSeconds: 3600 })
    : { allowed: true };
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfter || 0, emailLimit.retryAfter || 0);
    if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many reset requests. Please wait and try again.' });
  }

  // Only send a reset link to an address that actually has an account (stops
  // this endpoint from being used to mail arbitrary third parties), and bind the
  // link to that user's current token version. Always return the same generic
  // 200 so the response never reveals whether the account exists.
  try {
    if (email) {
      const supabase = getServiceClient();
      const user = await findUserByEmail(supabase, email);
      if (user) {
        const token = makeResetToken(email, secret, getResetTokenVersion(user));
        const siteUrl = PUBLIC_SITE_URL;
        const resetLink = `${siteUrl}/#/reset-password?token=${encodeURIComponent(token)}`;

        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
          },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            sender: {
              name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
              email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
            },
            to: [{ email }],
            subject: 'Reset your Proto Trading password',
            htmlContent: RESET_HTML(resetLink),
          }),
        });
        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          console.error('Password reset Brevo error:', resp.status, body || resp.statusText || 'unknown error');
        }
      }
    }
  } catch (err) {
    // Log but still return generic success â€” internal errors must not become an
    // account-existence side-channel.
    console.error('send-reset-email:', err.message);
  }

  await waitForGenericResponse(startedAt);
  return res.status(200).json(GENERIC_OK);
}


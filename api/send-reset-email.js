import {
  findUserByEmail,
  getResetSecret,
  getResetTokenVersion,
  getServiceClient,
  makeResetToken,
} from './_password-reset.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { PUBLIC_SITE_URL, PUBLIC_ASSET_URL } from './_public-site-url.js';

const RESET_HTML = (link) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Reset Your Password</title></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 12px;"><tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#111111;border-radius:18px;overflow:hidden;border:1px solid #2a2a2a;box-shadow:0 18px 50px rgba(0,0,0,0.55);">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 34px 28px;background:#111111;">
  <table cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr>
    <td style="vertical-align:middle;padding-right:13px;"><img src="${PUBLIC_ASSET_URL}/proto-logo.png" width="42" height="42" alt="Proto Trading" style="display:block;border-radius:8px;"></td>
    <td style="vertical-align:middle;"><span style="font-size:25px;font-weight:900;color:#ffffff;letter-spacing:0.5px;">PROTO</span><span style="font-size:25px;font-weight:900;color:#dc2626;letter-spacing:0.5px;"> TRADING</span></td>
  </tr></table>
  <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:900;">Reset your password</h1>
  <p style="margin:12px 0 0;color:#cfcfcf;font-size:15px;line-height:1.6;">Secure password reset for your Proto Trading Online account</p>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;font-weight:700;">Hi there,</p>
  <p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">We received a request to reset the password for your Proto Trading Online account.</p>
  <p style="margin:0 0 30px;color:#444444;font-size:16px;line-height:1.7;">Click the button below to create a new password. This link expires in 15 minutes and can be used once.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;"><tr><td align="center">
    <a href="${link}" style="display:inline-block;background:#c40000;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;padding:16px 42px;border-radius:10px;">Reset Password</a>
  </td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:12px;border-left:5px solid #c40000;">
    <tr><td style="padding:20px 22px;">
      <p style="margin:0 0 8px;color:#ffffff;font-size:15px;font-weight:800;">Security Notice</p>
      <p style="margin:0;color:#d8d8d8;font-size:14px;line-height:1.7;">If you did not request this password reset, you can safely ignore this email.</p>
    </td></tr>
  </table>
  <p style="margin:28px 0 10px;color:#666666;font-size:13px;">If the button does not work, copy and paste this link into your browser:</p>
  <p style="margin:0;word-break:break-all;font-size:13px;"><a href="${link}" style="color:#c40000;">${link}</a></p>
</td></tr>
<tr><td align="center" style="padding:30px 34px;background:#181818;border-top:1px solid #292929;">
  <p style="margin:0 0 8px;color:#ffffff;font-size:18px;font-weight:900;">Proto Trading Online</p>
  <p style="margin:0 0 12px;color:#cfcfcf;font-size:14px;">
    <a href="tel:+27214615883" style="color:#ff3333;text-decoration:none;font-weight:700;">+27 21 461 5883</a>
    &nbsp;|&nbsp;
    <a href="mailto:online@proto.co.za" style="color:#ff3333;text-decoration:none;font-weight:700;">online@proto.co.za</a>
  </p>
  <p style="margin:0;color:#a9a9a9;font-size:13px;">De Roos Street, off Sir Lowry Road, District Six, Cape Town, South Africa</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

// Identical response for every input — no account-existence oracle.
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
          const body = await resp.json().catch(() => ({}));
          console.error('Brevo API error:', resp.status, JSON.stringify(body));
        }
      }
    }
  } catch (err) {
    // Log but still return generic success — internal errors must not become an
    // account-existence side-channel.
    console.error('send-reset-email:', err.message);
  }

  await waitForGenericResponse(startedAt);
  return res.status(200).json(GENERIC_OK);
}

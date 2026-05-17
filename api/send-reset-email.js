import nodemailer from 'nodemailer';
import { createHmac } from 'crypto';

function makeToken(email, secret) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 3600000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

const RESET_HTML = (link) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Reset Your Password</title></head>
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
  <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:900;letter-spacing:-0.4px;">Reset your password</h1>
  <p style="margin:12px 0 0;color:#cfcfcf;font-size:15px;line-height:1.6;">Secure password reset for your Proto Trading Online account</p>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;line-height:1.6;font-weight:700;">Hi there,</p>
  <p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">We received a request to reset the password for your Proto Trading Online account.</p>
  <p style="margin:0 0 30px;color:#444444;font-size:16px;line-height:1.7;">Click the button below to create a new password. This link expires in 1 hour.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
    <tr><td align="center">
      <a href="${link}" style="display:inline-block;background:#c40000;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;padding:16px 42px;border-radius:10px;box-shadow:0 10px 24px rgba(196,0,0,0.28);">Reset Password</a>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:12px;overflow:hidden;border-left:5px solid #c40000;">
    <tr><td style="padding:20px 22px;">
      <p style="margin:0 0 8px;color:#ffffff;font-size:15px;font-weight:800;">Security Notice</p>
      <p style="margin:0;color:#d8d8d8;font-size:14px;line-height:1.7;">If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </td></tr>
  </table>
  <p style="margin:28px 0 10px;color:#666666;font-size:13px;line-height:1.6;">If the button does not work, copy and paste this link into your browser:</p>
  <p style="margin:0;word-break:break-all;font-size:13px;line-height:1.6;"><a href="${link}" style="color:#c40000;text-decoration:underline;">${link}</a></p>
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' });

  // Generate a stateless signed token — no Supabase API calls needed here.
  // If the email doesn't exist the do-reset-password endpoint will catch it.
  const token = makeToken(email.trim(), secret);
  const siteUrl = 'https://protoportal-main.vercel.app';
  const resetLink = `${siteUrl}/#/reset-password?token=${encodeURIComponent(token)}`;

  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Proto Trading Online" <${process.env.BREVO_SMTP_USER}>`,
    to: email.trim(),
    subject: 'Reset your Proto Trading password',
    html: RESET_HTML(resetLink),
  });

  return res.status(200).json({ ok: true });
}

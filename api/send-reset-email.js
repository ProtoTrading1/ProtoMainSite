import { createHmac } from 'crypto';
import nodemailer from 'nodemailer';

function makeToken(email, secret) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 3600000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

const RESET_HTML = (link) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Reset Your Password</title></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 12px;"><tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#111111;border-radius:18px;overflow:hidden;border:1px solid #2a2a2a;">
<tr><td style="height:6px;background:#c40000;">&nbsp;</td></tr>
<tr><td align="center" style="padding:38px 34px 30px;background:#141414;">
  <div style="display:inline-block;background:#ffffff;padding:14px 22px;border-radius:8px;margin-bottom:26px;">
    <span style="font-size:30px;font-weight:900;color:#c40000;">PROTO</span>
    <span style="font-size:20px;font-weight:800;color:#222222;"> TRADING</span>
  </div>
  <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;">Reset your password</h1>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;font-weight:700;">Hi there,</p>
  <p style="margin:0 0 30px;color:#444444;font-size:16px;line-height:1.7;">Click the button below to reset your Proto Trading Online password. This link expires in 1 hour.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;"><tr><td align="center">
    <a href="${link}" style="display:inline-block;background:#c40000;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;padding:16px 42px;border-radius:10px;">Reset Password</a>
  </td></tr></table>
  <p style="margin:28px 0 10px;color:#666666;font-size:13px;">If the button does not work, copy and paste this link:</p>
  <p style="margin:0;word-break:break-all;font-size:13px;"><a href="${link}" style="color:#c40000;">${link}</a></p>
</td></tr>
<tr><td align="center" style="padding:24px 34px;background:#181818;">
  <p style="margin:0;color:#ffffff;font-size:16px;font-weight:900;">Proto Trading Online</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' });

  const smtpUser = process.env.BREVO_SMTP_USER;
  const smtpPass = process.env.BREVO_SMTP_PASS;
  if (!smtpUser || !smtpPass) return res.status(500).json({ error: 'Email not configured' });

  const token = makeToken(email.trim(), secret);
  const resetLink = `https://protoportal-main.vercel.app/#/reset-password?token=${encodeURIComponent(token)}`;

  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  try {
    await transporter.sendMail({
      from: `"Proto Trading Online" <${smtpUser}>`,
      to: email.trim(),
      subject: 'Reset your Proto Trading password',
      html: RESET_HTML(resetLink),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('SMTP error:', err.message);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
}

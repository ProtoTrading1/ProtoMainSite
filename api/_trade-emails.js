import { escapeHtml } from './_escape-html.js';

export const BREVO_SENDER = {
  name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
  email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
};

export function buildWelcomeHtml(name) {
  return `<!DOCTYPE html>
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
}

export function buildApprovedHtml(name) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your Proto Trading account is ready</title></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 12px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#111111;border-radius:18px;overflow:hidden;border:1px solid #2a2a2a;">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:38px 34px 30px;background:#141414;">
  <div style="display:inline-block;background:#ffffff;padding:14px 22px;border-radius:8px;margin-bottom:26px;">
    <span style="font-size:30px;font-weight:900;color:#c40000;letter-spacing:1px;">PROTO</span>
    <span style="font-size:20px;font-weight:800;color:#222222;letter-spacing:0.5px;"> TRADING</span>
  </div>
  <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:900;">You're approved</h1>
  <p style="margin:12px 0 0;color:#cfcfcf;font-size:15px;line-height:1.6;">Your online trade account is live — log in now</p>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;line-height:1.6;font-weight:700;">Hi ${escapeHtml(name, 'there')},</p>
  <p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">Great news — your Proto Trading Online trade account has been approved. You can log in right away to browse the wholesale catalogue, check live stock, and submit order requests at trade pricing.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f8;border-radius:12px;border-left:5px solid #c40000;margin:0 0 24px;">
    <tr><td style="padding:20px 22px;">
      <p style="margin:0 0 8px;color:#7f1d1d;font-size:14px;font-weight:800;">Important — online vs in-store</p>
      <p style="margin:0;color:#444444;font-size:14px;line-height:1.7;">Approval on this online portal does <strong>not</strong> mean you are approved for in-store purchases at our warehouse. If you plan to visit us in person, please bring your business details — in-store trading may require separate verification on arrival.</p>
    </td></tr>
  </table>
  <p style="margin:0 0 24px;color:#444444;font-size:16px;line-height:1.7;">Log in at <a href="https://site.proto.co.za" style="color:#c40000;font-weight:700;">site.proto.co.za</a> with the email and password you registered with.</p>
  <p style="margin:0;color:#666666;font-size:13px;line-height:1.6;">Questions? <a href="mailto:online@proto.co.za" style="color:#c40000;">online@proto.co.za</a> · <a href="tel:+27214615883" style="color:#c40000;">+27 21 461 5883</a></p>
</td></tr>
<tr><td align="center" style="padding:30px 34px;background:#181818;border-top:1px solid #292929;">
  <p style="margin:0 0 8px;color:#ffffff;font-size:18px;font-weight:900;">Proto Trading Online</p>
  <p style="margin:0;color:#a9a9a9;font-size:13px;line-height:1.6;">De Roos Street, off Sir Lowry Road, District Six, Cape Town, South Africa</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export async function sendBrevoEmail({ to, subject, htmlContent }) {
  if (!process.env.BREVO_API_KEY) return { ok: false, skipped: true };
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: BREVO_SENDER,
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.error('Brevo email error:', resp.status, JSON.stringify(body));
      return { ok: false, status: resp.status };
    }
    return { ok: true };
  } catch (err) {
    console.error('Brevo email error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function sendTradeReceivedEmail(email, name) {
  return sendBrevoEmail({
    to: email,
    subject: 'We have received your trade account application',
    htmlContent: buildWelcomeHtml(name),
  });
}

export async function sendTradeApprovedEmail(email, name) {
  return sendBrevoEmail({
    to: email,
    subject: 'Your Proto Trading trade account is approved — log in now',
    htmlContent: buildApprovedHtml(name),
  });
}

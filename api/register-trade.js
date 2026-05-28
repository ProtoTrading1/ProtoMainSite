import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

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
  <p style="margin:0 0 18px;color:#111111;font-size:18px;line-height:1.6;font-weight:700;">Hi ${name || 'there'},</p>
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, contactName, businessName, phone, country, province, city, businessType, address, whatsappOptIn } = req.body || {};

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Create the user via admin API — skips Supabase's own confirmation email
  const { data, error } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: {
      name: contactName || businessName || '',
      phone: phone || null,
      business_name: businessName || null,
      country: country || null,
      province: province || null,
      city: city || null,
      business_type: businessType || null,
    },
  });

  if (error) {
    console.error('createUser error:', error);
    return res.status(400).json({ error: error.message });
  }

  // Insert customers row manually (in case the DB trigger doesn't fire for admin-created users)
  const userId = data.user?.id;
  if (userId) {
    const { error: custError } = await supabase.from('customers').upsert({
      id: userId,
      email: email.trim(),
      name: contactName || businessName || '',
      phone: phone || null,
      business_name: businessName || null,
      country: country || null,
      province: province || null,
      city: city || null,
      business_type: businessType || null,
      delivery_address: address || null,
      is_approved: false,
      tier: 'regular',
    }, { onConflict: 'id' });
    if (custError) console.error('customers upsert error:', custError.message);
  }

  // Send branded welcome email via Brevo SMTP
  try {
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
      subject: 'Your Proto Trading application has been received',
      html: WELCOME_HTML(contactName || businessName || ''),
    });
  } catch (emailErr) {
    // Don't fail the registration if email sending fails
    console.error('Welcome email error:', emailErr.message);
  }

  // Send WATI WhatsApp welcome broadcast if customer opted in
  if (whatsappOptIn && phone) {
    try {
      const watiUrl = process.env.WATI_API_URL;
      const watiToken = process.env.WATI_API_TOKEN;
      if (watiUrl && watiToken) {
        // WATI expects phone without + or spaces, e.g. 27821234567
        const cleanPhone = phone.replace(/\D/g, '');
        // broadcast_name must be unique per send
        const broadcastName = `proto_trading_welcome_${Date.now()}`;
        const watiRes = await fetch(`${watiUrl}/api/v1/sendTemplateMessage?whatsappNumber=${cleanPhone}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${watiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            template_name: 'proto_trading_welcome',
            broadcast_name: broadcastName,
            parameters: [{ name: 'name', value: contactName || businessName || 'Valued Customer' }],
          }),
        });
        const watiBody = await watiRes.text();
        console.log('WATI response:', watiRes.status, watiBody);
      }
    } catch (watiErr) {
      console.error('WATI broadcast error:', watiErr.message);
    }
  }

  return res.status(200).json({ ok: true });
}

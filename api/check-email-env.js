export default function handler(req, res) {
  return res.status(200).json({
    brevo_api_key: process.env.BREVO_API_KEY ? `set (${process.env.BREVO_API_KEY.slice(0,8)}...)` : 'MISSING',
    brevo_smtp_user: process.env.BREVO_SMTP_USER ? `set (${process.env.BREVO_SMTP_USER.slice(0,8)}...)` : 'MISSING',
    brevo_smtp_pass: process.env.BREVO_SMTP_PASS ? `set (${process.env.BREVO_SMTP_PASS.slice(0,8)}...)` : 'MISSING',
    resend_api_key: process.env.RESEND_API_KEY ? `set (${process.env.RESEND_API_KEY.slice(0,8)}...)` : 'MISSING',
  });
}

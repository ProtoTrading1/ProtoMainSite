import { createClient } from '@supabase/supabase-js';
import { escapeHtml } from './_escape-html.js';
import { PUBLIC_SITE_URL } from './_public-site-url.js';

export function tradeEmailClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

export function tradeTokenClient() {
  // OTP verification creates an Auth session in memory. Keep it separate from
  // the service client so the following RPC retains its service authorization.
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

export function verificationEmailHtml(name, link) {
  return `<h1>Confirm your email</h1><p>Hi ${escapeHtml(name || 'there')},</p>
    <p>Confirm this email address to complete your Proto Trading trade application.
    Existing customers receive catalogue access after confirmation; new applications are reviewed by our team.</p>
    <p><a href="${escapeHtml(link)}">Confirm my email</a></p>
    <p>This secure link can only be used once. If you did not apply, you can ignore this email.</p>`;
}

export async function sendTradeVerificationEmail({ client, userId, email, name, fetcher = fetch }) {
  if (!process.env.BREVO_API_KEY) return { sent: false };
  const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email });
  const token = data?.properties?.hashed_token;
  if (error || !token || data?.user?.id !== userId) throw new Error('Verification link could not be generated');
  const link = `${PUBLIC_SITE_URL}/#/verify-email?token_hash=${encodeURIComponent(token)}`;
  const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online', email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za' },
      to: [{ email }], subject: 'Confirm your email — Proto Trading', htmlContent: verificationEmailHtml(name, link),
    }),
    signal: AbortSignal.timeout(8000),
  });
  return { sent: response.ok };
}

export async function verifyTradeEmail({ tokenHash, verifyClient, serviceClient }) {
  if (typeof tokenHash !== 'string' || !/^[a-zA-Z0-9_-]{20,256}$/.test(tokenHash)) {
    const error = new Error('This confirmation link is invalid or expired. Request a new email.');
    error.status = 400; throw error;
  }
  const { data, error } = await verifyClient.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error || !data?.user?.id || !data.user.email_confirmed_at) {
    const failure = new Error('This confirmation link is invalid, expired or already used. Request a new email.');
    failure.status = 400; throw failure;
  }
  const result = await serviceClient.rpc('complete_trade_email_verification', { p_user_id: data.user.id });
  if (result.error || result.data?.verified !== true) {
    const failure = new Error('Your email was confirmed, but your trade application could not be updated. Request another confirmation email or contact Proto.');
    failure.status = 503; throw failure;
  }
  // Never send the OTP token or the Auth session to the browser in this response.
  return { ok: true, verified: true, approved: result.data.approved === true };
}

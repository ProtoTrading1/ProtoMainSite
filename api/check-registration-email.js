import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { validateEmail } from './register-trade.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const emailCheck = validateEmail(req.body?.email);
  if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });

  const ipLimit = await checkRateLimit({
    bucket: `registration-email-check:${clientIp(req)}`,
    max: 60,
    windowSeconds: 3600,
  });
  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(ipLimit.retryAfter || 60));
    return res.status(429).json({ error: 'Too many checks. Please wait a moment and try again.' });
  }

  const emailLimit = await checkRateLimit({
    bucket: `registration-email-check-email:${emailCheck.email}`,
    max: 10,
    windowSeconds: 3600,
  });
  if (!emailLimit.allowed) {
    res.setHeader('Retry-After', String(emailLimit.retryAfter || 60));
    return res.status(429).json({ error: 'Please wait a moment before checking this email again.' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('email', emailCheck.email)
    .limit(1);

  if (error) {
    console.error('registration email check:', error.message);
    return res.status(503).json({ error: 'We could not check this email right now. Please try again.' });
  }

  const exists = Array.isArray(data) && data.length > 0;
  return res.status(200).json({
    available: !exists,
    exists,
    recovery: exists ? 'SIGN_IN_OR_RESET_PASSWORD' : null,
  });
}

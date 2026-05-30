import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');
  const [payload, sig] = parts;
  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== expectedSig) throw new Error('Invalid token');
  const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (Date.now() > exp) throw new Error('Reset link has expired. Please request a new one.');
  return email;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let email;
  try {
    email = verifyToken(token, secret);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    secret,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Find user by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ filter: `email.eq.${email}` });
  if (listError) return res.status(500).json({ error: 'Server error' });

  const user = users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'Account not found' });

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ ok: true });
}

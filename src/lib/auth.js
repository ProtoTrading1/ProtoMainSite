import { supabase } from './supabase';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

export async function submitTradeApplication({ email, password, contactName, businessName, phone, country, province, city, businessType }) {
  // All questionnaire data goes into user metadata — a DB trigger reads it and
  // creates the customers row server-side (no RLS conflict).
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: contactName || businessName,
        phone: phone || null,
        business_name: businessName || null,
        country: country || null,
        province: province || null,
        city: city || null,
        business_type: businessType || null,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function resetPassword(email) {
  const trimmed = email.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: `${window.location.origin}/#/reset-password`,
  });
  if (error) throw error;

  // Also send a branded email via Brevo
  const brevoKey = import.meta.env.VITE_BREVO_API_KEY;
  if (brevoKey) {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Proto Trading', email: 'noreply@prototrading.co.za' },
        to: [{ email: trimmed }],
        subject: 'Reset your Proto Trading password',
        htmlContent: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#000;color:#fff;border-radius:12px;overflow:hidden">
            <div style="background:#000;padding:32px 32px 0">
              <strong style="font-size:18px;letter-spacing:1px">PROTO <span style="color:#8B1A1A">TRADING</span></strong>
            </div>
            <div style="padding:32px">
              <h2 style="margin:0 0 12px;font-size:22px">Password reset requested</h2>
              <p style="color:rgba(255,255,255,0.65);margin:0 0 24px">
                We received a request to reset the password for your Proto Trading trade account.<br>
                Check the email from <strong>noreply@supabase.io</strong> for the reset link — it arrives within a minute.
              </p>
              <p style="color:rgba(255,255,255,0.4);font-size:12px">
                If you didn't request this, you can ignore this email. Your password will not change.
              </p>
            </div>
          </div>
        `,
      }),
    }).catch(() => {}); // non-blocking — Supabase reset still works if Brevo fails
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCustomerProfile(userId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

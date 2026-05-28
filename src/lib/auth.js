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

export async function submitTradeApplication({ email, password, contactName, businessName, phone, country, province, city, businessType, whatsappOptIn }) {
  const res = await fetch('/api/register-trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, contactName, businessName, phone, country, province, city, businessType, whatsappOptIn }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function resetPassword(email) {
  const trimmed = email.trim();
  const res = await fetch('/api/send-reset-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send reset email');
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
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`/api/customer-profile?userId=${encodeURIComponent(userId)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    return json.profile ?? null;
  } catch {
    return null;
  }
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

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
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw error;
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

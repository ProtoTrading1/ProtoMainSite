import { supabase } from './supabase';

export async function updateProfile(id, fields) {
  const { data, error } = await supabase
    .from('customers')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

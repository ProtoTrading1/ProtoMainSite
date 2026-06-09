import { createClient } from '@supabase/supabase-js';

export const SITE_CONFIG_BUCKET = 'site-config';

export function getPortalAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function readSiteConfigJson(file, fallback = {}) {
  const supabase = getPortalAdminClient();
  const { data, error } = await supabase.storage.from(SITE_CONFIG_BUCKET).download(file);
  if (error) return fallback;
  const text = await data.text();
  return JSON.parse(text);
}

import { createClient } from '@supabase/supabase-js';

export const SITE_CONFIG_BUCKET = 'site-config';

export function getPortalAdminClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function readSiteConfigJson(file, fallback = {}) {
  const supabase = getPortalAdminClient();
  const { data, error } = await supabase.storage.from(SITE_CONFIG_BUCKET).download(file);
  if (error) return fallback;
  const text = await data.text();
  return JSON.parse(text);
}

export async function writeSiteConfigJson(file, payload) {
  const supabase = getPortalAdminClient();
  await supabase.storage.createBucket(SITE_CONFIG_BUCKET, { public: false }).catch(() => {});
  const body = JSON.stringify({ ...payload, updatedAt: new Date().toISOString() });
  const { error } = await supabase.storage.from(SITE_CONFIG_BUCKET).upload(file, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
  return JSON.parse(body);
}

function notifyLogFile(orderId) {
  return `orders/notify/${orderId}.json`;
}

export async function saveOrderNotifyLog(orderId, log) {
  if (!orderId) return;
  await writeSiteConfigJson(notifyLogFile(orderId), log);
}

export async function readOrderNotifyLog(orderId) {
  if (!orderId) return null;
  const data = await readSiteConfigJson(notifyLogFile(orderId), null);
  return data?.orderId === orderId ? data : data?.sent != null ? data : null;
}

import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { EXTENSION_DAYS, ONE_DAY_MS } from '../lib/basket-expiry.mjs';

function serviceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (process.env.BASKET_EXPIRY_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Basket recovery is not enabled' });
  }

  const approved = await requireApprovedCustomer(req, res);
  if (!approved) return;
  const supabase = serviceClient();
  const { data: row, error: loadError } = await supabase
    .from('customer_account_carts')
    .select('*')
    .eq('customer_id', approved.user.id)
    .maybeSingle();
  if (loadError) return res.status(503).json({ error: 'Saved basket could not be loaded' });
  if (!row || !Array.isArray(row.archived_items) || !row.archived_items.length) {
    return res.status(409).json({ error: 'There is no archived basket to restore' });
  }
  if (Array.isArray(row.items) && row.items.length) {
    return res.status(409).json({ error: 'Your current basket is not empty' });
  }

  const now = Date.now();
  const { data, error } = await supabase
    .from('customer_account_carts')
    .update({
      items: row.archived_items,
      archived_items: [],
      archived_at: null,
      activity_at: now,
      started_at: new Date(now).toISOString(),
      expires_at: new Date(now + EXTENSION_DAYS * ONE_DAY_MS).toISOString(),
      extension_used: true,
      reminder_3d_sent_at: new Date(now).toISOString(),
      reminder_1d_sent_at: null,
      revision: Number(row.revision || 0) + 1,
      updated_at: new Date(now).toISOString(),
    })
    .eq('customer_id', approved.user.id)
    .eq('revision', row.revision)
    .select('*')
    .maybeSingle();
  if (error) return res.status(503).json({ error: 'Saved basket could not be restored' });
  if (!data) return res.status(409).json({ error: 'The basket changed on another device' });

  return res.status(200).json({
    items: data.items,
    activityAt: data.activity_at,
    revision: data.revision,
    startedAt: data.started_at,
    expiresAt: data.expires_at,
    extensionUsed: true,
    archivedAt: null,
    hasArchivedBasket: false,
  });
}

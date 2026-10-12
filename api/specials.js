import { getPortalAdminClient } from './_site-config.js';
import { requireAdmin } from './_auth.js';

const BUCKET = 'site-config';
const FILE = 'specials.json';


export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // GET — return current specials
  if (req.method === 'GET') {
    try {
      const supabase = getPortalAdminClient();
      const { data, error } = await supabase.storage.from(BUCKET).download(FILE);
      if (error) return res.status(200).json({ items: [] });
      const text = await data.text();
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).json({ items: [] });
    }
  }

  // POST — save specials (max 10)
  if (req.method === 'POST') {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const body = req.body || {};
      const items = (body.items || []).slice(0, 10);
      const payload = JSON.stringify({ items, updatedAt: new Date().toISOString() });
      const supabase = getPortalAdminClient();

      // Try to create bucket if it doesn't exist (safe to call if already exists)
      await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});

      const { error } = await supabase.storage.from(BUCKET).upload(FILE, payload, {
        contentType: 'application/json',
        upsert: true,
      });
      if (error) throw error;
      return res.status(200).json({ ok: true, items });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).end();
}

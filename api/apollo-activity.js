import { createClient } from '@supabase/supabase-js';
import { requireAuth } from './_auth.js';

const MAX_BODY_BYTES = 16 * 1024;
const ACTIVITY_SOURCES = new Set(['main', 'instore']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(['search_completed', 'product_view', 'category_view', 'cart_item_added', 'active_interval']);
// Keep this intake rule aligned with the database check constraint. The
// private event store intentionally does not accept delayed identifiable data.
const MAX_EVENT_AGE = 86400000;
const MAX_EVENT_FUTURE = 5 * 60000;
function strictText(value) { return typeof value === 'string' && value.trim() && value.length <= 240 ? value.trim() : null; }
function strictInteger(value, min, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= min && value <= max ? value : null; }
function parseIso(value) {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\\d\\d:\\d\\d)$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? { ms, iso: new Date(ms).toISOString() } : null;
}
function strictObject(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.has(key)); }

function serviceClient() {
  if (!process.env.APOLLO_ACTIVITY_SUPABASE_URL || !process.env.APOLLO_ACTIVITY_SUPABASE_SERVICE_ROLE_KEY) throw new Error('Apollo activity database is not configured');
  return createClient(process.env.APOLLO_ACTIVITY_SUPABASE_URL, process.env.APOLLO_ACTIVITY_SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function createApolloActivityHandler({ verify = (req, res) => requireAuth(req, res), client = serviceClient, enabled = () => process.env.APOLLO_ACTIVITY_ENABLED === 'true', source = process.env.APOLLO_ACTIVITY_SOURCE, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!enabled()) return res.status(404).json({ error: 'Not found' });
    const user = await verify(req, res);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    let body;
    try { body = req.body; if (Buffer.byteLength(JSON.stringify(body || {}), 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Event too large' }); } catch { return res.status(400).json({ error: 'Invalid event' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !UUID.test(String(user.id || '')) || body.customer_id) return res.status(400).json({ error: 'Invalid event' });
    const receivedAt = now();
    const receipt = (typeof receivedAt === 'number' || receivedAt instanceof Date) && Number.isFinite(new Date(receivedAt).getTime()) ? new Date(receivedAt) : null;
    const occurred = parseIso(body.occurred_at);
    if (!UUID.test(String(body.event_id || '')) || !UUID.test(String(body.session_id || '')) || !receipt || !occurred) return res.status(400).json({ error: 'Invalid event' });
    if (occurred.ms < receipt.getTime() - MAX_EVENT_AGE || occurred.ms > receipt.getTime() + MAX_EVENT_FUTURE) return res.status(400).json({ error: 'Invalid event' });
    if (!ACTIVITY_SOURCES.has(source) || body.source !== source) return res.status(400).json({ error: 'Invalid event' });
    if (!TYPES.has(body.event_type) || Object.keys(body).some((key) => !['event_id', 'session_id', 'source', 'event_type', 'occurred_at', 'search', 'product', 'category', 'cart', 'interval'].includes(key))) return res.status(400).json({ error: 'Invalid event' });
    const names = ['search', 'product', 'category', 'cart', 'interval'];
    const expected = { search_completed: 'search', product_view: 'product', category_view: 'category', cart_item_added: 'cart', active_interval: 'interval' }[body.event_type];
    if (names.filter((key) => Object.hasOwn(body, key)).length !== 1 || !Object.hasOwn(body, expected)) return res.status(400).json({ error: 'Invalid event' });
    const schemas = { search: ['original', 'normalized', 'results_count'], product: ['kind', 'id', 'parent_id'], category: ['id'], cart: ['product_id', 'quantity'], interval: ['start_at', 'end_at', 'seconds'] };
    const raw = body[expected]; if (!strictObject(raw, new Set(schemas[expected]))) return res.status(400).json({ error: 'Invalid event' });
    let payload;
    if (expected === 'search') { const original = strictText(raw.original), normalized = strictText(raw.normalized), results = strictInteger(raw.results_count, 0); if (!original || !normalized || results === null) return res.status(400).json({ error: 'Invalid event' }); payload = { original, normalized, results_count: results }; }
    if (expected === 'product') { const id = strictText(raw.id); if (!id || !['parent','variant'].includes(raw.kind) || (raw.kind === 'parent' && Object.hasOwn(raw,'parent_id'))) return res.status(400).json({ error: 'Invalid event' }); payload = { kind: raw.kind, id }; if (raw.kind === 'variant') { const parentId = strictText(raw.parent_id); if (!parentId) return res.status(400).json({ error: 'Invalid event' }); payload.parent_id = parentId; } }
    if (expected === 'category') { const id = strictText(raw.id); if (!id) return res.status(400).json({ error: 'Invalid event' }); payload = { id }; }
    if (expected === 'cart') { const productId = strictText(raw.product_id), quantity = strictInteger(raw.quantity, 1); if (!productId || quantity === null) return res.status(400).json({ error: 'Invalid event' }); payload = { product_id: productId, quantity }; }
    if (expected === 'interval') { const start = parseIso(raw.start_at), end = parseIso(raw.end_at), seconds = strictInteger(raw.seconds, 1, 60); if (!start || !end || seconds === null || end.ms <= start.ms || end.ms - start.ms > 60000 || Math.floor((end.ms - start.ms)/1000) !== seconds || end.ms > occurred.ms + MAX_EVENT_FUTURE) return res.status(400).json({ error: 'Invalid event' }); payload = { start_at: start.iso, end_at: end.iso, seconds }; }
    const row = { event_id: body.event_id, customer_id: user.id, session_id: body.session_id, source, event_type: body.event_type, occurred_at: occurred.iso, received_at: receipt.toISOString(), payload };
    try {
      const { error } = await client().from('apollo_activity_events').insert(row, { onConflict: 'event_id', ignoreDuplicates: true });
      if (error) return res.status(503).json({ error: 'Activity could not be recorded' });
    } catch { return res.status(503).json({ error: 'Activity could not be recorded' }); }
    return res.status(202).json({ ok: true });
  };
}

export default createApolloActivityHandler();

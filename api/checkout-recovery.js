import { requireApprovedCustomer } from './_auth.js';
import { getPortalAdminClient } from './_site-config.js';
import { assertMatchingOrder, assertOrderReplaySchemaReady, checkoutRequestHash } from './_order-replay.js';

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function parsePayload(body) {
  if (!object(body)) throw new Error('Invalid payload');
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_PAYLOAD_BYTES) throw new Error('Invalid payload');
  const clientRef = clean(body.clientRef);
  if (!/^(?:[0-9a-f]{8}-[0-9a-f-]{27}|ref-[A-Za-z0-9-]{12,80})$/i.test(clientRef)
    || !["Customer's own courier", 'Proto Trading delivers', 'In store pick up'].includes(clean(body.deliveryMethod))
    || clean(body.customerNotes).length > 2000 || !Array.isArray(body.items) || !body.items.length || body.items.length > 250
    || body.items.some((item) => !object(item) || !object(item.product)
      || !object(item.product.checkoutSnapshot)
      || !Object.hasOwn(item.product.checkoutSnapshot, 'unitPrice')
      || !Object.hasOwn(item.product.checkoutSnapshot, 'stockQty'))) throw new Error('Invalid payload');
  return { clientRef, requestHash: checkoutRequestHash(body) };
}

// Lookup only: absence cannot prove that another in-flight capture will not
// commit. Never capture, deliver, repair or authorize a replacement reference.
export function createCheckoutRecoveryHandler({
  requireAccess = requireApprovedCustomer, getDb = getPortalAdminClient,
  assertReady = assertOrderReplaySchemaReady, isPreview = () => process.env.VERCEL_ENV === 'preview',
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    if (isPreview()) return res.status(403).json({ error: 'Checkout recovery is disabled in Preview.', state: 'held', reconciliationRequired: true });
    let access;
    try { access = await requireAccess(req, res); }
    catch { return res.status(503).json({ state: 'held', code: 'CHECKOUT_RECOVERY_UNAVAILABLE',
      error: 'Account verification is temporarily unavailable.', safeToStartNew: false, reconciliationRequired: true }); }
    if (!access) return;
    let payload;
    try { payload = parsePayload(req.body); }
    catch { return res.status(400).json({ state: 'held', code: 'CHECKOUT_RECOVERY_INVALID_PAYLOAD', error: 'Supply the complete original checkout request.', reconciliationRequired: true }); }
    try {
      const customerId = access.user?.id;
      if (typeof customerId !== 'string' || !UUID.test(customerId)) throw new Error('Invalid verified account');
      const db = getDb();
      await assertReady(db);
      const lookup = await db.from('orders')
        .select('id, order_number, customer_id, client_ref, checkout_request_hash, checkout_notification_snapshot')
        .eq('customer_id', customerId).eq('client_ref', payload.clientRef).maybeSingle();
      if (!object(lookup) || !Object.hasOwn(lookup, 'data') || lookup.error) throw new Error('Lookup unavailable');
      const data = lookup.data;
      if (data === null) return res.status(200).json({ state: 'not_found', safeToStartNew: false, reconciliationRequired: true });
      if (data.customer_id !== customerId || data.client_ref !== payload.clientRef
        || typeof data.id !== 'string' || !UUID.test(data.id)
        || typeof data.order_number !== 'string' || !data.order_number.trim() || data.order_number.length > 120) throw new Error('Invalid lookup evidence');
      assertMatchingOrder(data, payload.requestHash);
      return res.status(200).json({ state: 'received', success: true, orderId: data.id, orderNumber: data.order_number, deliveryUnchecked: true });
    } catch (error) {
      const conflict = error?.code === 'ORDER_REFERENCE_CONFLICT';
      return res.status(conflict ? 409 : 503).json({ state: 'held', reconciliationRequired: true,
        safeToStartNew: false, code: conflict ? 'ORDER_REFERENCE_CONFLICT' : 'CHECKOUT_RECOVERY_UNAVAILABLE',
        error: conflict ? 'This reference belongs to a different or historical request. Check My Orders or contact Proto.'
          : 'Your earlier checkout could not be verified. Keep this request and try the read-only check later.' });
    }
  };
}
export default createCheckoutRecoveryHandler();

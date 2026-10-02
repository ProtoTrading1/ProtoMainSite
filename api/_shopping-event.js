export const SHOPPING_EVENTS = new Set(['catalogue_viewed', 'department_viewed', 'search_results_viewed', 'product_viewed', 'search_result_clicked', 'basket_item_added', 'basket_item_removed', 'basket_quantity_changed', 'checkout_started', 'order_submitted', 'search_tip_shown', 'search_tip_dismissed', 'search_tip_search_clicked', 'personalised_tip_shown', 'personalised_tip_dismissed', 'personalised_tip_clicked']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value, required = false) { if (!value && !required) return null; if (!UUID.test(value || '')) throw new TypeError('Invalid identifier'); return value; }
function integer(value) { if (value == null) return null; if (!Number.isSafeInteger(value) || value < 0 || value > 10000000) throw new TypeError('Invalid count'); return value; }
function text(value, max) { if (value == null) return null; if (typeof value !== 'string' || value.length > max || [...value].some(character => character.charCodeAt(0) < 32)) throw new TypeError('Invalid text'); return value.trim() || null; }
export function normalizeShoppingEvent(input) {
  if (!SHOPPING_EVENTS.has(input.eventType)) throw new TypeError('Invalid event type');
  if (input.source != null && !['main', 'instore'].includes(input.source)) throw new TypeError('Invalid source');
  if (input.position != null && input.position < 1) throw new TypeError('Invalid position');
  if (input.tipStage != null && !['initial', 'reminder', 'arrival'].includes(input.tipStage)) throw new TypeError('Invalid tip stage');
  if (input.eventType === 'search_results_viewed' && (!input.searchTerm?.trim() || input.resultsCount == null || !input.source)) throw new TypeError('Search evidence required');
  if (['product_viewed', 'search_result_clicked', 'basket_item_added', 'basket_item_removed', 'basket_quantity_changed'].includes(input.eventType) && (!input.productId || !input.source)) throw new TypeError('Product evidence required');
  if (input.eventType.startsWith('basket_') && !(input.quantity > 0)) throw new TypeError('Quantity required');
  if (input.eventType.startsWith('search_tip_') && !input.tipStage) throw new TypeError('Tip stage required');
  if (input.eventType.startsWith('personalised_tip_') && (input.tipStage !== 'arrival' || !input.productId || !input.source)) throw new TypeError('Arrival evidence required');
  const metadata = {};
  for (const key of ['department', 'collection', 'reason']) {
    const value = input.metadata?.[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 160 && ![...value].some(character => { const code = character.charCodeAt(0); return code < 32 || (code >= 127 && code <= 159); })) metadata[key] = value;
  }
  return { event_id: uuid(input.eventId, true), event_type: input.eventType, session_id: uuid(input.sessionId, true), source: input.source || null, product_id: text(input.productId, 128), search_id: uuid(input.searchId), search_term: text(input.searchTerm, 200), results_count: integer(input.resultsCount), main_results_count: integer(input.mainResultsCount), instore_results_count: integer(input.instoreResultsCount), position: integer(input.position), tip_stage: input.tipStage || null, quantity: integer(input.quantity), order_id: uuid(input.orderId), metadata };
}
export function shoppingEnvironment(req, env = process.env) {
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  return 'local';
}
export function internalShoppingUser(access, excluded = process.env.ANALYTICS_EXCLUDED_CUSTOMER_IDS || '') {
  const internalRoles = ['admin', 'staff', 'owner', 'super_admin', 'superadmin', 'employee'];
  const verifiedRoles = [access.customer?.role, access.user.app_metadata?.role];
  // Match the deployed admin server allowlist using only auth.getUser's verified email.
  const adminEmails = ['danieljoffeinfo@gmail.com', 'george@proto.co.za', 'online@proto.co.za'];
  return adminEmails.includes(String(access.user.email || '').trim().toLowerCase()) || verifiedRoles.some(role => internalRoles.includes(String(role || '').trim().toLowerCase())) || excluded.split(',').map(x => x.trim()).includes(access.user.id);
}

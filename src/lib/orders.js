import { supabase } from './supabase';
import { captureAuthIdentity, assertAuthIdentity } from './authHeaders';
import { withDeadline } from './requestDeadline.mjs';

/** Idempotency key for one checkout attempt (crypto.randomUUID with fallback). */
export function makeClientRef() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export const CUSTOMER_ORDER_COLUMNS = Object.freeze([
  'id', 'customer_id', 'order_number', 'created_at', 'status', 'items',
  'total_ex_vat', 'discount_amount', 'discount_pct', 'promo_code', 'delivery_method', 'customer_notes',
]);
function ownershipFailure() {
  const error = new Error('Your signed-in account changed. Please reload orders for the current account.');
  error.code = 'AUTH_ACCOUNT_CHANGED';
  return error;
}
export function createCustomerOrderReader({
  client = supabase, captureIdentity = captureAuthIdentity, assertIdentity = assertAuthIdentity, timeoutMs = 15_000,
} = {}) {
  async function read(customerId, limit, single) {
    const identity = captureIdentity();
    assertIdentity(identity);
    if (!customerId || identity.userId !== customerId) throw ownershipFailure();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid order history limit');
    let query = client.from('orders').select(CUSTOMER_ORDER_COLUMNS.join(','))
      .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(limit);
    if (single) query = query.maybeSingle();
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) throw new Error('Invalid order history timeout');
    const controller = new AbortController();
    query = query.abortSignal(controller.signal);
    let response;
    try {
      response = await withDeadline(() => query, { timeoutMs,
        message: 'Your orders are taking too long to load. Please retry order history.',
        onTimeout: () => controller.abort(),
      });
    } finally {
      controller.abort();
      assertIdentity(identity);
    }
    if (response?.error) throw response.error;
    const data = response?.data;
    if (single ? data !== null && (!data || typeof data !== 'object' || Array.isArray(data)) : !Array.isArray(data)) {
      throw new Error('Order history could not be verified');
    }
    const rows = single ? data === null ? [] : [data] : data;
    if (rows.some((row) => !row || row.customer_id !== customerId)) throw ownershipFailure();
    const projected = rows.map((row) => Object.fromEntries(CUSTOMER_ORDER_COLUMNS
      .filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])));
    assertIdentity(identity);
    return single ? projected[0] || null : projected;
  }
  return { fetchOrderHistory: (customerId, limit = 10) => read(customerId, limit, false),
    fetchLastOrder: (customerId) => read(customerId, 1, true) };
}
const customerOrderReader = createCustomerOrderReader();
export const fetchOrderHistory = customerOrderReader.fetchOrderHistory;
export const fetchLastOrder = customerOrderReader.fetchLastOrder;

// A cancelled profile read cannot publish, even on A -> B -> A transitions.
export function createOrderHistoryReadScope(customerId, onRows, {
  readHistory = fetchOrderHistory, captureIdentity = captureAuthIdentity, assertIdentity = assertAuthIdentity,
} = {}) {
  const identity = captureIdentity();
  let active = true;
  const publish = (state) => {
    assertIdentity(identity);
    if (active) onRows({ customerId, identity, rows: [], error: null, ...state });
  };
  const done = Promise.resolve().then(() => {
    assertIdentity(identity);
    if (!active) return null;
    if (!customerId || identity.userId !== customerId) throw ownershipFailure();
    publish({ state: 'loading' });
    return readHistory(customerId, 10);
  }).then((rows) => {
    if (rows !== null) publish({ state: 'loaded', rows });
  }).catch(() => {
    // Do not publish a late error or service details into another account.
    try { publish({ state: 'error', error: 'Your orders could not be loaded. Check your connection and try again.' }); }
    catch { /* The owning auth epoch no longer exists. */ }
  });
  return { done, cancel() { active = false; } };
}
export function visibleOrderHistoryState(state, customerId, identity = captureAuthIdentity()) {
  return state?.customerId === customerId && state?.identity === identity && identity.userId === customerId
    ? state : { state: 'loading', rows: [], error: null };
}
export function visibleOrderHistory(state, customerId, identity = captureAuthIdentity()) {
  const current = visibleOrderHistoryState(state, customerId, identity);
  return current.state === 'loaded' ? current.rows : [];
}

export const ACTIVITY_SOURCES = new Set(['main', 'instore']);
export const ACTIVITY_TYPES = new Set(['search_completed', 'product_view', 'category_view', 'cart_item_added', 'active_interval']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function timestamp(value, field) {
  if (value === null || value === undefined || value === '') throw new TypeError(`Invalid ${field}`);
  const result = value instanceof Date ? value.getTime() : (typeof value === 'number' ? value : NaN);
  if (!Number.isFinite(result) || result < 0) throw new TypeError(`Invalid ${field}`);
  return result;
}
function sessionId(value) { if (!UUID.test(String(value || ''))) throw new TypeError('Invalid session id'); return String(value); }
function text(value, field) { if (typeof value !== 'string' || !value.trim() || value.length > 240) throw new TypeError(`Invalid ${field}`); return value.trim(); }
function positive(value, field, max = Infinity) { if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new TypeError(`Invalid ${field}`); return value; }

export function buildActivityEvent({ eventType, source, sessionId: suppliedSession, occurredAt = Date.now(), ...fields } = {}) {
  if (!ACTIVITY_TYPES.has(eventType)) throw new TypeError('Invalid event type');
  if (!ACTIVITY_SOURCES.has(source)) throw new TypeError('Invalid source');
  const eventId = globalThis.crypto?.randomUUID?.();
  if (!UUID.test(eventId || '')) throw new TypeError('Event UUID unavailable');
  const event = { event_id: eventId, session_id: sessionId(suppliedSession), source, event_type: eventType, occurred_at: new Date(timestamp(occurredAt, 'timestamp')).toISOString() };
  if (eventType === 'search_completed') event.search = { original: text(fields.original, 'search original'), normalized: text(fields.normalized, 'search normalized'), results_count: fields.resultsCount >= 0 && Number.isSafeInteger(fields.resultsCount) ? fields.resultsCount : (() => { throw new TypeError('Invalid results count'); })() };
  if (eventType === 'product_view') { if (!['parent', 'variant'].includes(fields.productKind)) throw new TypeError('Product kind is required'); event.product = { kind: fields.productKind, id: text(fields.productId, 'product id') }; if (fields.productKind === 'variant') event.product.parent_id = text(fields.parentId, 'parent id'); }
  if (eventType === 'category_view') event.category = { id: text(fields.categoryId, 'category id') };
  if (eventType === 'cart_item_added') event.cart = { product_id: text(fields.productId, 'product id'), quantity: positive(fields.quantity, 'quantity') };
  if (eventType === 'active_interval') { const start = timestamp(fields.startAt, 'start timestamp'); const end = timestamp(fields.endAt, 'end timestamp'); const seconds = positive(fields.seconds, 'interval', 60); if (end <= start || end - start > 60000 || Math.floor((end - start) / 1000) !== seconds) throw new TypeError('Invalid interval'); event.interval = { start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), seconds }; }
  return Object.freeze(event);
}

export function buildActiveInterval({ source, sessionId: suppliedSession, visible, intervalStart, visibleSince, lastInteractionAt, now = Date.now() } = {}) {
  if (!visible) return null;
  const end = timestamp(now, 'timestamp'); const initial = timestamp(intervalStart, 'interval start'); const shown = timestamp(visibleSince, 'visible since'); const last = timestamp(lastInteractionAt, 'last interaction');
  if (initial > end || shown > end || last > end || shown > initial) return null;
  const activeEnd = Math.min(end, last + 120000); const start = Math.max(initial, shown, end - 60000);
  if (activeEnd - start < 1000) return null;
  return buildActivityEvent({ eventType: 'active_interval', source, sessionId: suppliedSession, occurredAt: end, startAt: start, endAt: activeEnd, seconds: Math.floor((activeEnd - start) / 1000) });
}

export function createActivityQueue({ send, enabled = false, maxQueue = 100, batchSize = 20, maxRetries = 2 } = {}) {
  if (![maxQueue, batchSize, maxRetries].every(Number.isInteger) ||
      maxQueue < 1 || maxQueue > 100 || batchSize < 1 || batchSize > 20 ||
      maxRetries < 0 || maxRetries > 3) throw new TypeError('Invalid queue limits');
  const queue = [];
  const attempts = new Map();
  let inflight = 0, running = null, disposed = false, dropped = 0;
  function drain() {
    if (running) return running;
    if (disposed || !enabled || typeof send !== 'function' || !queue.length) return Promise.resolve();
    running = Promise.resolve().then(async () => {
      while (queue.length && !disposed) {
        const batch = queue.splice(0, batchSize);
        inflight = batch.length;
        try {
          await send(batch);
          batch.forEach(event => attempts.delete(event.event_id));
        } catch {
          if (!disposed) {
            const retry = [];
            for (const event of batch) {
              const count = (attempts.get(event.event_id) || 0) + 1;
              if (count <= maxRetries) { attempts.set(event.event_id, count); retry.push(event); }
              else { attempts.delete(event.event_id); dropped += 1; }
            }
            queue.unshift(...retry);
            inflight = 0;
            if (retry.length) await new Promise(resolve => setTimeout(resolve, 25));
          }
        } finally { inflight = 0; }
      }
    }).finally(() => { running = null; if (disposed) attempts.clear(); });
    return running;
  }
  return {
    enqueue(event) {
      if (!enabled || disposed || !event || queue.length + inflight >= maxQueue) {
        if (enabled && event) dropped += 1;
        return false;
      }
      queue.push(event);
      void drain().catch(() => {});
      return true;
    },
    flush: drain,
    dispose() { disposed = true; queue.length = 0; attempts.clear(); },
    size: () => queue.length + inflight,
    dropped: () => dropped,
  };
}

// The browser never supplies a customer identity. The API derives it from the
// authenticated token; this helper only queues valid, feature-gated events.
export function createApolloActivityReporter({ enabled = false, sessionId: suppliedSessionId, send, now = () => Date.now() } = {}) {
  const session = sessionId(suppliedSessionId);
  const queue = createActivityQueue({ enabled: Boolean(enabled), send });
  const record = (eventType, fields = {}) => {
    if (!enabled) return false;
    try {
      return queue.enqueue(buildActivityEvent({ eventType, sessionId: session, occurredAt: now(), ...fields }));
    } catch { return false; }
  };
  return Object.freeze({
    record,
    recordActiveInterval(fields = {}) {
      if (!enabled) return false;
      try {
        const event = buildActiveInterval({ sessionId: session, now: now(), ...fields });
        return event ? queue.enqueue(event) : false;
      } catch { return false; }
    },
    flush: () => queue.flush(),
    dispose: () => queue.dispose(),
  });
}

// Browser lifecycle wrapper for active-time estimates. It deliberately records
// only bounded intervals, never a customer identity: the API attaches the
// authenticated customer server-side. A newly-visible document must receive a
// deliberate interaction before any time is counted.
export function startActiveTimeLifecycle({
  enabled = false,
  reporter,
  getSource,
  documentRef = globalThis.document,
  now = () => Date.now(),
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  if (!enabled || !reporter?.recordActiveInterval || typeof getSource !== 'function' || !documentRef?.addEventListener) return () => {};

  const isVisible = () => documentRef.visibilityState === 'visible';
  let visibleSince = isVisible() ? now() : null;
  let intervalStart = visibleSince;
  let lastInteractionAt = null;
  let intervalSource = null;
  let stopped = false;

  const capture = ({ allowHidden = false } = {}) => {
    if (stopped || visibleSince === null || intervalStart === null || lastInteractionAt === null || (!allowHidden && !isVisible())) return false;
    const capturedAt = now();
    const source = getSource();
    // The section may change between timer ticks. Do not assign an interval
    // spanning that transition to either surface; wait for new interaction.
    if (source !== intervalSource) {
      intervalStart = capturedAt;
      lastInteractionAt = null;
      intervalSource = source;
      return false;
    }
    const accepted = reporter.recordActiveInterval({
      source,
      visible: true,
      intervalStart,
      visibleSince,
      lastInteractionAt,
    });
    // Advance even if transport drops the event. Retrying this interval later
    // would turn a transient client failure into double-counted active time.
    intervalStart = capturedAt;
    return accepted;
  };

  const recordInteraction = () => {
    if (stopped || !isVisible()) return;
    const interactedAt = now();
    // Do not retrospectively count an idle period before the first (or a
    // post-idle) interaction.
    if (lastInteractionAt === null || interactedAt - lastInteractionAt > 120000) intervalStart = interactedAt;
    intervalSource = getSource();
    lastInteractionAt = interactedAt;
  };

  const onVisibilityChange = () => {
    if (isVisible()) {
      visibleSince = now();
      intervalStart = visibleSince;
      lastInteractionAt = null;
      intervalSource = null;
      return;
    }
    // visibilitychange observes the already-hidden state; include only the
    // bounded interval that ended at that transition, then clear all state.
    capture({ allowHidden: true });
    visibleSince = null;
    intervalStart = null;
    lastInteractionAt = null;
    intervalSource = null;
  };

  const interactionEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  interactionEvents.forEach((type) => documentRef.addEventListener(type, recordInteraction, { passive: true }));
  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  const timer = setIntervalFn(capture, 60000);

  return () => {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(timer);
    interactionEvents.forEach((type) => documentRef.removeEventListener(type, recordInteraction));
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

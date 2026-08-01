export const JOURNEY_EVENT_TYPES = new Set([
  'registration_started',
  'registration_step_completed',
  'registration_validation_failed',
  'registration_failed',
  'registration_completed',
  'existing_email_recovery_selected',
  'login_failed',
  'login_succeeded',
  'password_reset_requested',
  'password_reset_failed',
  'password_reset_completed',
  'basket_sync_failed',
  'basket_cleared',
  'basket_restored',
  'checkout_started',
  'checkout_validation_failed',
  'order_submit_failed',
  'order_submit_succeeded',
]);

export const JOURNEYS = new Set([
  'registration',
  'authentication',
  'basket',
  'checkout',
]);

const SAFE_METADATA_KEYS = new Set([
  'delivery_method',
  'error_code',
  'line_count',
  'recovery_action',
  'retry',
  'source',
  'step_number',
  'viewport_class',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TEXT_RE = /^[a-z0-9][a-z0-9_.:-]{0,79}$/i;

function safeText(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!SAFE_TEXT_RE.test(text)) throw new TypeError(`Invalid ${field}`);
  return text;
}
function safeMetadata(input) {
  if (input === null || input === undefined) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Invalid metadata');
  }

  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    } else if (typeof value === 'string' && SAFE_TEXT_RE.test(value.trim())) {
      result[key] = value.trim();
    }
  }
  return result;
}

export function normalizeJourneyEvent(input = {}) {
  if (!JOURNEY_EVENT_TYPES.has(input.eventType)) {
    throw new TypeError('Invalid event type');
  }
  if (!JOURNEYS.has(input.journey)) {
    throw new TypeError('Invalid journey');
  }
  if (!UUID_RE.test(String(input.sessionId || ''))) {
    throw new TypeError('Invalid session');
  }

  return {
    event_type: input.eventType,
    journey: input.journey,
    step: safeText(input.step, 'step'),
    outcome: safeText(input.outcome, 'outcome'),
    session_id: input.sessionId,
    metadata: safeMetadata(input.metadata),
  };
}

// How long a response is reused without going back to the network at all.
export const RESPONSE_CACHE_TTL_MS = 30_000;

// How old a stored response may be and still be painted immediately on a new
// page load. It is always revalidated in the background and replaced as soon as
// the fresh response lands, and the window is kept close to the server's own
// snapshot window so a customer never opens on a materially older collection.
export const STORED_RESPONSE_MAX_AGE_MS = 300_000;

// The whole-collection payload is megabytes. It is held in memory for instant
// local searching and never written to browser storage.
export const STORED_RESPONSE_MAX_BYTES = 512_000;

export const STORED_RESPONSE_LIMIT = 8;

export const STORAGE_KEY_PREFIX = 'proto_instore_response_v2:';

/** The identity of a view: the query string the API is asked for. */
export function instoreRequestKey(query = '', { page = 1, category = '', includeCatalogue = false } = {}) {
  const params = new URLSearchParams();
  const normalized = String(query || '').trim();
  if (normalized) params.set('q', normalized);
  if (category) params.set('category', category);
  if (includeCatalogue) params.set('catalogue', '1');
  params.set('page', String(Math.max(1, Number.parseInt(page, 10) || 1)));
  return params.toString();
}

/**
 * Whether a stored entry may be shown while the fresh response is fetched.
 * Anything unreadable, undated, older than the window, or not carrying a
 * product list is discarded rather than guessed at.
 */
export function storedResponseIsUsable(entry, { now = Date.now(), maxAgeMs = STORED_RESPONSE_MAX_AGE_MS } = {}) {
  if (!entry || typeof entry !== 'object') return false;
  if (!Array.isArray(entry?.data?.products)) return false;
  const age = now - Number(entry.storedAt);
  // A negative age is a clock change, not a response from the future.
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}

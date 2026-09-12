import { authenticatedGetJson } from './authHeaders';

const RESPONSE_CACHE_TTL_MS = 60_000;
const responseCache = new Map();
let catalogueRequest = null;

function cachedCatalogue() {
  const cached = responseCache.get('catalogue=1&page=1');
  if (!cached || cached.expiresAt <= Date.now() || !Array.isArray(cached.data?.catalogue)) return null;
  return cached.data.catalogue;
}

// The initial result remains a small, fast 60-product response. Once it has
// arrived, warm the identical already-vetted catalogue in the background so
// browsing a tile, searching, or paging does not start the same API work again.
// This is deliberately short-lived: live availability is still checked when a
// customer adds an Instore item to their basket and again at checkout.
export function getCachedExtendedRangeCatalogue() {
  return cachedCatalogue();
}

export function primeExtendedRangeCatalogue() {
  const cached = cachedCatalogue();
  if (cached) return Promise.resolve(cached);
  if (catalogueRequest) return catalogueRequest;

  catalogueRequest = fetchExtendedRange('', { page: 1, includeCatalogue: true })
    .then((data) => Array.isArray(data?.catalogue) ? data.catalogue : null)
    .finally(() => { catalogueRequest = null; });
  return catalogueRequest;
}

export async function fetchExtendedRange(query = '', { signal, page = 1, category = '', includeCatalogue = false } = {}) {
  const params = new URLSearchParams();
  const normalized = String(query || '').trim();
  if (normalized) params.set('q', normalized);
  if (category) params.set('category', category);
  if (includeCatalogue) params.set('catalogue', '1');
  params.set('page', String(Math.max(1, Number.parseInt(page, 10) || 1)));
  const cacheKey = params.toString();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  // The preview may be reading a few thousand staged products. Give its
  // protected, server-side eligibility checks enough time to finish instead
  // of turning a slow-but-valid response into a false loading failure.
  // The API response is explicitly private, so this lets the customer's own
  // browser reuse a recent page after navigation or refresh. It is never a
  // shared/CDN cache, and live availability remains verified in the basket.
  const { response, data } = await authenticatedGetJson(`/api/extended-range?${params.toString()}`, { cache: 'default', signal, timeoutMs: 45000 });
  if (!response.ok) throw new Error('Unable to load Instore Products. Please try again.');
  if (!signal?.aborted) {
    responseCache.set(cacheKey, { data, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
    if (responseCache.size > 40) {
      for (const [key, value] of responseCache) {
        if (value.expiresAt <= Date.now()) responseCache.delete(key);
      }
    }
  }
  return data;
}

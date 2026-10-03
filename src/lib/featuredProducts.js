import { requestJson } from './requestDeadline.mjs';

const FEATURED_TTL = 15_000;

let _cache = null;
let _cachedAt = 0;
let _promise = null;

export function invalidateFeaturedCache() {
  _cache = null;
  _cachedAt = 0;
  _promise = null;
}

/** Uppercase SKUs in admin-saved order for the home Featured sort. */
export async function getFeaturedProducts() {
  if (_cache && Date.now() - _cachedAt < FEATURED_TTL) return _cache;
  _cache = null;
  if (!_promise) {
    _promise = requestJson('/api/featured-products', { cache: 'no-store' }, { timeoutMs: 10_000 })
      .then((data) => {
        if (!Array.isArray(data?.items)) throw new Error('Featured products are unavailable. Please try again.');
        _cache = data.items.map((i) => String(i.sku || '').toUpperCase()).filter(Boolean);
        _cachedAt = Date.now();
        _promise = null;
        return _cache;
      })
      .finally(() => {
        _promise = null;
      });
  }
  return _promise;
}

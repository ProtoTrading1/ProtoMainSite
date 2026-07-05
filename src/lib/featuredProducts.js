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
    _promise = fetch('/api/featured-products', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        _cache = Array.isArray(data?.items)
          ? data.items.map((i) => String(i.sku || '').toUpperCase()).filter(Boolean)
          : [];
        _cachedAt = Date.now();
        _promise = null;
        return _cache;
      })
      .catch(() => {
        _promise = null;
        return [];
      });
  }
  return _promise;
}

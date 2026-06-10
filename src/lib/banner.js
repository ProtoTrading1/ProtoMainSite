let _cache = null;
let _loadPromise = null;

export function invalidateBannerCache() {
  _cache = null;
  _loadPromise = null;
}

export async function fetchBanner({ force = false } = {}) {
  if (!force && _cache) return _cache;
  if (!force && _loadPromise) return _loadPromise;

  _loadPromise = fetch(`/api/banner?_=${Date.now()}`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Banner fetch failed (${res.status})`);
      const data = await res.json();
      _cache = data;
      return data;
    })
    .finally(() => {
      _loadPromise = null;
    });

  return _loadPromise;
}

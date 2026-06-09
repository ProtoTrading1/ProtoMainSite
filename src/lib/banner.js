let _cache = null;
let _loadPromise = null;

export async function fetchBanner() {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  _loadPromise = fetch('/api/banner', { signal: controller.signal })
    .then((r) => r.json())
    .then((data) => { _cache = data; return data; })
    .catch(() => null)
    .finally(() => { clearTimeout(timeout); _loadPromise = null; });
  return _loadPromise;
}

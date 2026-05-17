let _cache = null;
let _loadPromise = null;

export async function fetchSpecials() {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  _loadPromise = fetch('/api/specials', { signal: controller.signal })
    .then((r) => r.json())
    .then((data) => { _cache = data; return data; })
    .catch(() => ({ items: [] }))
    .finally(() => { clearTimeout(timeout); _loadPromise = null; });
  return _loadPromise;
}

export async function saveSpecials(items) {
  _cache = null;
  const res = await fetch('/api/specials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items.slice(0, 10) }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to save specials');
  _cache = json;
  return json;
}

export function invalidateSpecialsCache() {
  _cache = null;
}

export function buildSpecialsMap(data) {
  const map = {};
  for (const item of (data?.items || [])) {
    map[item.productId] = item;
  }
  return map;
}

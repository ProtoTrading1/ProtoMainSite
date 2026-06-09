let _cache = null;
let _loadPromise = null;

export async function fetchPopupSpecial() {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  _loadPromise = fetch('/api/popup-special', { signal: controller.signal })
    .then((r) => r.json())
    .then((data) => { _cache = data; return data; })
    .catch(() => ({ active: false, imageUrl: '', updatedAt: '' }))
    .finally(() => { clearTimeout(timeout); _loadPromise = null; });
  return _loadPromise;
}

const DISMISS_KEY = 'proto_popup_dismissed_at';

export function shouldShowPopup(config) {
  if (!config?.active || !config?.imageUrl) return false;
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return true;
  return dismissed !== String(config.updatedAt || '');
}

export function dismissPopup(config) {
  localStorage.setItem(DISMISS_KEY, String(config?.updatedAt || 'dismissed'));
}

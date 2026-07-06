const SUPABASE_OBJECT_PATH = '/storage/v1/object/public/';

function encodeRemoteUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.pathname = parsed.pathname
      .split('/')
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join('/');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Card grid thumbnails — smaller Supabase transforms; other hosts unchanged. */
export function catalogCardImageUrl(url) {
  const raw = (url || '').trim();
  if (!raw) return '';
  const encoded = encodeRemoteUrl(raw);
  if (!encoded.includes(SUPABASE_OBJECT_PATH)) return encoded;

  try {
    const parsed = new URL(encoded);
    parsed.pathname = parsed.pathname.replace(
      SUPABASE_OBJECT_PATH,
      '/storage/v1/render/image/public/',
    );
    parsed.searchParams.set('width', '400');
    parsed.searchParams.set('quality', '80');
    parsed.searchParams.set('resize', 'contain');
    return parsed.toString();
  } catch {
    return encoded;
  }
}

export function optimizedImageUrl(url) {
  return encodeRemoteUrl(url);
}

export function buildImageCandidates(url, { variant = 'card' } = {}) {
  const raw = (url || '').trim();
  if (!raw) return [];

  if (variant === 'modal') {
    return [...new Set([optimizedImageUrl(raw), raw].filter(Boolean))];
  }

  const card = catalogCardImageUrl(raw);
  const full = optimizedImageUrl(raw);
  return [...new Set([card, full, raw].filter(Boolean))];
}

/** Warm browser cache for catalogue thumbnails (non-blocking). */
export function preloadProductImages(urls, { limit = 60 } = {}) {
  if (typeof window === 'undefined' || !urls?.length) return;
  const seen = new Set();
  let count = 0;
  for (const url of urls) {
    if (count >= limit) break;
    const src = catalogCardImageUrl(url);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    count += 1;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}

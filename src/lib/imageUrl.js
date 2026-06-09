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

export function optimizedImageUrl(url) {
  return encodeRemoteUrl(url);
}

export function buildImageCandidates(url) {
  const raw = (url || '').trim();
  if (!raw) return [];
  const candidates = [optimizedImageUrl(raw), raw];
  return [...new Set(candidates.filter(Boolean))];
}

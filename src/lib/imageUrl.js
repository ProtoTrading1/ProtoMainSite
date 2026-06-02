// Reverted aggressive downscaling so catalogue and category images use their original source.
// We now rely on route/component code-splitting and deferred non-critical UI for speed,
// rather than shrinking product assets too hard in the CDN transformation layer.
export function optimizedImageUrl(url) {
  return url;
}

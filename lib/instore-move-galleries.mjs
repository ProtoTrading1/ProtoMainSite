// Only completed, main-image-matching moves can supply this gallery. The writer
// keeps the original URLs and stock; it does not publish the Archive draft photos.
export const instoreMoveGalleriesEnabled = env => env?.PROTO_ARCHIVE_MOVE_GALLERIES_ENABLED === '1';
const safeUrl = value => {
  try { const u = new URL(value); return typeof value === 'string' && value.length <= 4096
    && u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
};
export async function attachInstoreMoveGalleries(products, client, { timeoutMs = 2000 } = {}) {
  if (!Array.isArray(products)) return products;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2000) return products;
  const candidates = products.filter(p => p.hasPreservedInstoreGallery === true && p.imageStatus !== 'hidden' && typeof p.sku === 'string' && /^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(p.sku));
  if (!candidates.length) return products;
  const skus = [...new Set(candidates.map(p => p.sku))], found = new Map();
  try {
    const reader = typeof client === 'function' ? client() : client;
    const deadline = Date.now() + timeoutMs;
    for (let i = 0; i < skus.length; i += 20) {
      const selected = skus.slice(i, i + 20), remaining = deadline - Date.now();
      if (remaining <= 0) throw Error('Move gallery timeout');
      const { data, error } = await reader.rpc('loader_archive_listing_move_galleries_v1', { p_body: { skus: selected } }).abortSignal(AbortSignal.timeout(remaining));
      if (error || !Array.isArray(data) || data.length > selected.length) throw Error('Move gallery unavailable');
      for (const g of data) {
        if (!g || Object.keys(g).sort().join(',') !== 'currentImage,imageUrls,sku' || !selected.includes(g.sku) || found.has(g.sku)
          || !Array.isArray(g.imageUrls) || g.imageUrls.length < 1 || g.imageUrls.length > 200
          || g.imageUrls[0] !== g.currentImage || new Set(g.imageUrls).size !== g.imageUrls.length
          || g.imageUrls.some(url => !safeUrl(url))) throw Error('Move gallery invalid');
        found.set(g.sku, g);
      }
    }
  } catch { return products; }
  return products.map(p => {
    const gallery = found.get(p.sku);
    return p.hasPreservedInstoreGallery === true && p.imageStatus !== 'hidden' && gallery?.currentImage === (p.images?.[0] || p.image)
      ? { ...p, images: [...gallery.imageUrls] } : p;
  });
}

// Isolated prototype only: no network, database client or production route.
// The caller must supply complete, current, verified data from trusted adapters.
const identifier = value => String(value ?? '').trim().toUpperCase();
const normalized = value => identifier(value).replace(/[^A-Z0-9]/g, '');

export function prepareWebsiteOnlyRows({ manifest, observations, existing, controls, now, maxAgeMs = 300000 }) {
  if (!manifest || !Array.isArray(manifest.items) || !manifest.items.length) throw Error('Invalid manifest');
  if (!existing?.complete || !controls?.complete || !Array.isArray(existing.identifiers)
      || !Array.isArray(controls.hiddenListings) || !Array.isArray(controls.hiddenImages)) throw Error('Incomplete duplicate or control evidence');
  if (!Array.isArray(observations)) throw Error('Missing source observations');
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) throw Error('Invalid observation time');
  const source = new Map();
  for (const entry of observations) {
    const key = identifier(entry.sku);
    if (!key || source.has(key)) throw Error('Duplicate source observation');
    source.set(key, entry);
  }
  const blocked = new Set(existing.identifiers.map(normalized));
  const hidden = new Set(controls.hiddenListings.map(normalized));
  const hiddenImages = new Set(controls.hiddenImages.map(normalized));
  const seen = new Set();
  return manifest.items.map(item => {
    const sku = identifier(item.sku), key = normalized(sku), current = source.get(sku);
    if (!sku || !key || seen.has(key)) throw Error('Duplicate manifest identifier');
    seen.add(key);
    if (blocked.has(key) || hidden.has(key)) throw Error(`Listing collision or removal: ${sku}`);
    if (!current || current.found !== true || identifier(current.sku) !== sku) throw Error(`Source unavailable: ${sku}`);
    if (!Number.isFinite(current.observedAt) || current.observedAt > now || now-current.observedAt > maxAgeMs) throw Error(`Stale source: ${sku}`);
    if (String(current.description || '').trim() !== String(item.description || '').trim() || String(current.units || '').trim() !== String(item.units || '').trim()) throw Error(`Source identity changed: ${sku}`);
    if (!Number.isFinite(current.price) || current.price <= 0 || !Number.isFinite(current.onHand) || !Number.isFinite(current.booked) || current.booked < 0) throw Error(`Invalid source values: ${sku}`);
    if (!/^\/[a-zA-Z0-9/_\-.]+$/.test(item.mainPath || '') || !/^[a-f0-9]{64}$/.test(item.mainSha256 || '') || !Array.isArray(item.photos) || !item.photos.some(p => p.path === item.mainPath && p.sha256 === item.mainSha256)) throw Error(`Unverified main photo: ${sku}`);
    if (item.photos.some(p => !/^\/[a-zA-Z0-9/_\-.]+$/.test(p.path || '') || !/^[a-f0-9]{64}$/.test(p.sha256 || ''))) throw Error(`Invalid photo: ${sku}`);
    return { sku, description: current.description, units: current.units, price: current.price,
      available: current.onHand - current.booked, image: hiddenImages.has(key) ? null : item.mainPath,
      photos: hiddenImages.has(key) ? [] : item.photos.map(p => ({...p})), category: item.category };
  });
}

// Publication is intentionally absent. Returning data must never create an
// order, adjust stock, write SQL, or change a listing. Adapters and production
// integration require separate implementation and verification.

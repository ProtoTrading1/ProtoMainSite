function productKey(product) {
  return String(product?.id || product?.sku || product?.code || '').trim().toUpperCase();
}

/** Compare saved basket snapshots with the current catalogue prices. */
export function detectCartPriceChanges(savedItems = [], currentItems = []) {
  const currentByKey = new Map();
  for (const item of Array.isArray(currentItems) ? currentItems : []) {
    const key = productKey(item?.product);
    if (key) currentByKey.set(key, item);
  }

  const changes = [];
  for (const saved of Array.isArray(savedItems) ? savedItems : []) {
    const key = productKey(saved?.product);
    const current = currentByKey.get(key);
    if (!key || !current) continue;

    const previousPrice = Number(saved?.product?.price);
    const currentPrice = Number(current?.product?.price);
    if (!Number.isFinite(previousPrice) || !Number.isFinite(currentPrice)) continue;
    if (Math.abs(previousPrice - currentPrice) < 0.005) continue;

    const qty = Math.max(1, Math.floor(Number(current.qty) || Number(saved.qty) || 1));
    changes.push({
      key,
      name: String(current.product?.name || saved.product?.name || key),
      previousPrice,
      currentPrice,
      qty,
      difference: (currentPrice - previousPrice) * qty,
      direction: currentPrice > previousPrice ? 'increased' : 'decreased',
    });
  }
  return changes;
}

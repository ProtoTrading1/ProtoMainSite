/**
 * Grouping key for a product row. An explicit admin variant group (migration
 * 052, attached as `groupId` when catalogGrouping is on) wins over the legacy
 * shared-barcode grouping. Prefixes (`g:` / `b:`) keep the two keyspaces from
 * colliding. When no groupId is present the result is barcode-based exactly as
 * before, so disabled behaviour is unchanged.
 */
export function variantGroupKey(product) {
  const adminGroup = String(product?.groupId || '').trim();
  if (adminGroup) return `g:${adminGroup}`;
  const barcode = String(product?.barcode || product?.code || '').trim();
  return barcode ? `b:${barcode}` : null;
}

function deriveGroupTitle(variants) {
  const names = variants.map((v) => String(v.name || v.title || '').trim()).filter(Boolean);
  if (!names.length) return null;
  if (names.length === 1) return names[0];

  let prefix = names[0];
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i += 1;
    prefix = prefix.slice(0, i);
    if (!prefix.trim()) break;
  }

  const trimmed = prefix.replace(/[\s\-–|,]+$/, '').trim();
  if (trimmed.length >= 8) return trimmed;
  return names[0];
}

/** Collapse variant rows that share a barcode into one card with a variants[] list. */
export function groupProductsByBarcode(products) {
  if (!Array.isArray(products) || !products.length) return [];

  const groups = new Map();
  const order = [];

  for (const product of products) {
    const key = variantGroupKey(product);
    if (!key) {
      order.push({ type: 'single', product });
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push({ type: 'group', key });
    }
    groups.get(key).push(product);
  }

  const seenGroups = new Set();
  const out = [];

  for (const entry of order) {
    if (entry.type === 'single') {
      out.push(entry.product);
      continue;
    }
    if (seenGroups.has(entry.key)) continue;
    seenGroups.add(entry.key);

    const variants = groups.get(entry.key) || [];
    if (variants.length <= 1) {
      out.push(variants[0] || { id: entry.key, code: entry.key, barcode: entry.key, name: entry.key });
      continue;
    }

    const rep = variants.find((v) => v.image || v.localImage) || variants[0];
    const isAdminGroup = Boolean(rep.groupId);
    // Card identity (code/barcode) must come from a real member, never the group
    // key — for an admin group the key is `g:<uuid>`. Prefer the designated
    // primary member; fall back to the image-preferring rep.
    const primaryMember = isAdminGroup
      ? (variants.find((v) => String(v.sku || v.id) === String(rep.groupPrimarySku)) || rep)
      : rep;
    const adminTitle = isAdminGroup ? String(rep.groupTitle || '').trim() : '';
    const groupTitle = adminTitle || deriveGroupTitle(variants) || primaryMember.name || primaryMember.title || entry.key;
    const groupImages = variants.flatMap((v) => v.images || (v.image ? [v.image] : [])).filter(Boolean);
    // Keep barcode-group ids byte-identical to before (`group_<barcode>`); admin
    // groups get a stable, distinct id.
    const idKey = isAdminGroup
      ? `g_${rep.groupId}`
      : String(primaryMember.barcode || primaryMember.code || entry.key.replace(/^b:/, ''));

    out.push({
      ...rep,
      id: `group_${idKey}`,
      code: primaryMember.code || rep.code || '',
      barcode: primaryMember.barcode || rep.barcode || '',
      parentSku: primaryMember.barcode || rep.barcode || primaryMember.code || '',
      name: groupTitle,
      title: groupTitle,
      image: rep.image || rep.localImage || groupImages[0] || '',
      images: groupImages.length ? [...new Set(groupImages)] : rep.images,
      isVariantGroup: true,
      variantCount: variants.length,
      variants,
    });
  }

  return out;
}

/** When search matches one variant, keep siblings that share the same barcode. */
export function expandBarcodeSiblings(pool, matched) {
  if (!Array.isArray(matched) || !matched.length) return matched || [];

  const keys = new Set(matched.map(variantGroupKey).filter(Boolean));
  if (!keys.size) return matched;

  const ids = new Set(matched.map((p) => p.id));
  for (const product of pool) {
    const key = variantGroupKey(product);
    if (key && keys.has(key)) ids.add(product.id);
  }

  const out = [];
  const seen = new Set();
  for (const product of matched) {
    if (seen.has(product.id) || !ids.has(product.id)) continue;
    out.push(product);
    seen.add(product.id);
  }
  for (const product of pool) {
    if (seen.has(product.id) || !ids.has(product.id)) continue;
    out.push(product);
    seen.add(product.id);
  }
  return out;
}

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

function isMalformedSku(product) {
  return /^\[?\s*object\s+object\s*\]?$/i.test(String(product?.sku ?? '').trim());
}

function variantIdentity(product) {
  return String(product?.barcode || product?.code || product?.sku || product?.id || '')
    .trim()
    .toUpperCase();
}

// Admin grouping can contain a legacy duplicate whose SKU was imported as
// "[OBJECT OBJECT]" while retaining the same barcode as the real variant.
// Keep the valid source row, and keep a unique malformed row only when there
// is no matching valid member to replace it with.
function cleanAdminVariants(variants) {
  const out = [];
  const positions = new Map();
  for (const variant of variants) {
    const key = variantIdentity(variant);
    if (!key || !positions.has(key)) {
      positions.set(key, out.length);
      out.push(variant);
      continue;
    }
    const position = positions.get(key);
    const existing = out[position];
    if (isMalformedSku(existing) && !isMalformedSku(variant)) out[position] = variant;
    // Otherwise the existing valid member wins and the duplicate is omitted.
  }
  return out;
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
    const primarySkuKey = String(rep.groupPrimarySku || '').trim().toUpperCase();
    const primaryMember = isAdminGroup
      ? (variants.find((v) => String(v.sku || v.id || '').trim().toUpperCase() === primarySkuKey) || rep)
      : rep;
    const adminTitle = isAdminGroup ? String(rep.groupTitle || '').trim() : '';
    // Preserve a complete sellable item's description on a grouped card. The
    // variant badge communicates alternatives; a shared-prefix label can cut
    // off useful colour and size details.
    const groupTitle = adminTitle || primaryMember.name || primaryMember.title || deriveGroupTitle(variants) || entry.key;
    const displayVariants = isAdminGroup ? cleanAdminVariants(variants) : variants;
    const groupImages = displayVariants.flatMap((v) => v.images || (v.image ? [v.image] : [])).filter(Boolean);
    // Keep barcode-group ids byte-identical to before (`group_<barcode>`); admin
    // groups get a stable, distinct id.
    const idKey = isAdminGroup
      ? `g_${rep.groupId}`
      : String(primaryMember.barcode || primaryMember.code || entry.key.replace(/^b:/, ''));

    out.push({
      // Admin groups use the designated primary member for card metadata as
      // well as its image, so SKU, barcode, modal default, and image cannot
      // disagree. Legacy barcode groups retain the previous representative.
      ...(isAdminGroup ? primaryMember : rep),
      id: `group_${idKey}`,
      code: primaryMember.code || rep.code || '',
      barcode: primaryMember.barcode || rep.barcode || '',
      parentSku: primaryMember.barcode || rep.barcode || primaryMember.code || '',
      name: groupTitle,
      title: groupTitle,
      image: isAdminGroup
        ? (primaryMember.image || primaryMember.localImage || primaryMember.images?.[0] || groupImages[0] || '')
        : (rep.image || rep.localImage || groupImages[0] || ''),
      images: groupImages.length ? [...new Set(groupImages)] : rep.images,
      isVariantGroup: true,
      variantCount: displayVariants.length,
      variants: displayVariants,
      ...(isAdminGroup ? { primaryVariantId: primaryMember.id } : {}),
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

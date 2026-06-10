export const DEPT_SLUG_MAP = {
  'Arts, Crafts & Stationery': 'arts-crafts-stationery',
  'Beads, Jewellery & Accessories': 'beads-jewellery',
  'Beauty & Personal Care': 'beauty-personal-care',
  'Events & Parties': 'events-parties',
  'Fashion & Accessories': 'fashion-accessories',
  'Food & Drinks': 'food-drinks',
  'Hardware': 'hardware',
  'Homeware & Kitchen': 'homeware-kitchen',
  'Packaging': 'packaging',
  'Textiles': 'textiles',
  'Toys, Games & Kids': 'toys-games-kids',
};

export const SLUG_TO_DEPT_LABEL = Object.fromEntries(
  Object.entries(DEPT_SLUG_MAP).map(([label, slug]) => [slug, label]),
);

export function labelToSlug(label) {
  if (!label) return '';
  return label
    .toLowerCase()
    .replace(/[,&]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function deptSlugFromRow(categoryValue) {
  const raw = (categoryValue || '').trim();
  if (!raw) return '';
  return DEPT_SLUG_MAP[raw] || labelToSlug(raw);
}

export function deptLabelFromSlug(slug) {
  if (!slug) return '';
  return SLUG_TO_DEPT_LABEL[slug] || slug;
}

/**
 * Build categoryPath [L1, L2?, L3?] from DB columns, with optional SKU_SUBS fallback.
 * @param {object} wpRow - website_products row
 * @param {Record<string, string[]>} [skuSubs] - api/_sku-subcategories map (server only)
 */
export function buildCategoryPath(wpRow, skuSubs = {}) {
  const deptSlug = deptSlugFromRow(wpRow.category);
  if (!deptSlug) return [];

  const dbL2 = (wpRow.subcategory || '').trim();
  const dbL3 = (wpRow.leaf_category || '').trim();
  const subs = skuSubs[wpRow.website_sku] || [];
  const fallbackL2 = subs[0] ? labelToSlug(subs[0]) : '';
  const fallbackL3 = subs[1] ? labelToSlug(subs[1]) : '';

  const l2 = dbL2 || fallbackL2;
  const l3 = dbL3 || fallbackL3;

  if (l2 && l3) return [deptSlug, l2, l3];
  if (l2) return [deptSlug, l2];
  return [deptSlug];
}

/** DB patch fields from a slug-based categoryPath array. */
export function categoryPathToDbPatch(categoryPath) {
  if (!categoryPath?.length) return {};
  return {
    category: deptLabelFromSlug(categoryPath[0]),
    subcategory: categoryPath[1] || '',
    leaf_category: categoryPath[2] || '',
  };
}

export function matchesCategoryPath(productPath, filterPath) {
  if (!filterPath?.length) return true;
  const cp = productPath || [];
  if (filterPath[0] === '__unassigned__') {
    return cp.length <= 1;
  }
  const depth = Math.min(cp.length, filterPath.length);
  return depth > 0 && filterPath.every((seg, i) => cp[i] === seg);
}

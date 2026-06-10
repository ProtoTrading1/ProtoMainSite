import categories from '../data/categories.json';

// IMPORTANT: this MUST stay identical to labelToSlug in scripts/lib/master.mjs.
// The category generator fails on slug collisions, which guarantees this is a
// safe 1:1 mapping between a label and its slug at every level of the tree.
export function labelToSlug(label) {
  if (label === null || label === undefined) return '';
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Flat slug -> label map (first occurrence wins) for display helpers.
const SLUG_TO_LABEL = {};
(function index(nodes) {
  for (const n of nodes) {
    if (!(n.id in SLUG_TO_LABEL)) SLUG_TO_LABEL[n.id] = n.label;
    if (n.children?.length) index(n.children);
  }
})(categories);

export function slugToLabel(slug) {
  if (!slug) return '';
  return SLUG_TO_LABEL[slug] || String(slug).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a slug categoryPath from human labels (category + ordered subcategory levels). */
export function buildCategoryPath(category, subLabels = []) {
  const catSlug = labelToSlug(category);
  if (!catSlug) return [];
  const path = [catSlug];
  for (const sub of subLabels) {
    if (sub) path.push(labelToSlug(sub));
  }
  return path;
}

export { categories };

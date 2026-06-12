import bundledCategories from '../data/categories.json';

// IMPORTANT: this MUST stay identical to labelToSlug in scripts/lib/master.mjs
// and to the admin app's labelToSlug. The category generator fails on slug
// collisions, which guarantees this is a safe 1:1 mapping between a label
// and its slug at every level of the tree.
export function labelToSlug(label) {
  if (label === null || label === undefined) return '';
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// The "active" taxonomy starts as the bundled snapshot and is replaced at
// runtime once the live tree is fetched from /api/taxonomy. Slug → label
// lookups walk the active tree so renames in the admin reflect immediately
// across the site (sidebar, mobile nav, breadcrumbs, back bar).
let _activeTree = bundledCategories;
let _slugToLabel = buildSlugMap(bundledCategories);
const _listeners = new Set();

function buildSlugMap(nodes) {
  const map = {};
  (function index(list) {
    for (const n of list) {
      if (!(n.id in map)) map[n.id] = n.label;
      if (n.children?.length) index(n.children);
    }
  })(nodes || []);
  return map;
}

/** Replace the live taxonomy tree (e.g. after fetching /api/taxonomy). */
export function setActiveTaxonomy(nextTree) {
  if (!Array.isArray(nextTree) || !nextTree.length) return _activeTree;
  _activeTree = nextTree;
  _slugToLabel = buildSlugMap(nextTree);
  for (const fn of _listeners) {
    try { fn(_activeTree); } catch { /* ignore */ }
  }
  return _activeTree;
}

/** Subscribe to active-tree changes (returns an unsubscribe fn). */
export function subscribeTaxonomy(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getActiveTaxonomy() {
  return _activeTree;
}

export function slugToLabel(slug) {
  if (!slug) return '';
  return _slugToLabel[slug] || String(slug).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

// `categories` is kept as a named export for backwards compatibility, but it
// is the *bundled* snapshot. Consumers that need live updates should import
// `bundledCategories` and combine it with `useLiveTaxonomy()` (see
// ./useLiveTaxonomy.js) or call `getActiveTaxonomy()`.
export { bundledCategories };
export const categories = bundledCategories;

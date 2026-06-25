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

/** Legacy nav ids whose slug no longer matches labelToSlug(label) after a rename. */
const LEGACY_NAV_ALIASES = {
  // Pre-restructure aliases — keep old slugs resolving to new top-level ids
  'arts-crafts-stationery': 'arts-and-crafts',
  'art-supplies-and-stationery': 'arts-and-crafts',
  'beads-jewellery-accessories': 'beads',
  'events-parties': 'party-events-seasonals',
  'food-drinks': 'confectionery',
  'homeware-kitchen': 'homeware',
  'motarro': 'stationery',
  'packaging': 'packaging-storage',
  'toys-games-kids': 'kids-toys-games',
};

/**
 * Map a navigation path (taxonomy node ids) to product categoryPath slugs.
 * Products derive slugs from DB labels via labelToSlug; taxonomy ids stay
 * stable across renames — this bridges the two.
 */
export function resolveNavPathForProducts(navPath, categories) {
  if (!Array.isArray(navPath) || !navPath.length) return [];
  if (!Array.isArray(categories) || !categories.length) {
    return navPath.map((seg, i) => (i === 0 && LEGACY_NAV_ALIASES[seg]) || seg);
  }

  const out = [];
  let nodes = categories;
  for (let i = 0; i < navPath.length; i += 1) {
    const seg = navPath[i];
    const node = (nodes || []).find((n) => n.id === seg);
    if (!node) {
      // Node no longer in tree (deleted) — use alias as fallback so old product slugs still match.
      out.push(i === 0 && LEGACY_NAV_ALIASES[seg] ? LEGACY_NAV_ALIASES[seg] : seg);
      break;
    }
    // Node found: always derive the slug from the live label so renames are reflected immediately.
    out.push(labelToSlug(node.label));
    nodes = node.children || [];
  }
  return out;
}

/** Count map keys use product slug paths — resolve nav path before lookup. */
export function productCountKey(navPath, categories) {
  return resolveNavPathForProducts(navPath, categories).join('/');
}

/** All keys that may hold a saved order for this nav path (canonical + legacy). */
export function sortOrderLookupKeys(navPath, categories) {
  if (!Array.isArray(navPath) || !navPath.length) return [];
  const keys = [];
  const seen = new Set();
  const add = (key) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  const resolved = resolveNavPathForProducts(navPath, categories);
  if (resolved.length) add(resolved.join('/'));
  add(navPath.join('/'));

  const alias = LEGACY_NAV_ALIASES[navPath[0]];
  if (alias) {
    add([alias, ...navPath.slice(1)].join('/'));
    add([navPath[0], ...navPath.slice(1)].join('/'));
  }

  // Fall back to parent-level sort orders so a subcategory page inherits the
  // parent's saved order when no subcategory-specific order has been saved yet.
  for (let i = resolved.length - 1; i >= 1; i -= 1) {
    add(resolved.slice(0, i).join('/'));
  }

  return keys;
}

/** Find skuOrder[] for a category path in a sort-order store. */
export function lookupSortOrder(sortOrders, navPath, categories) {
  if (!sortOrders || !navPath?.length) return null;
  for (const key of sortOrderLookupKeys(navPath, categories)) {
    const skuOrder = sortOrders[key]?.skuOrder;
    if (Array.isArray(skuOrder) && skuOrder.length) return skuOrder;
  }
  return null;
}

export function applySkuOrder(products, skuOrder) {
  if (!skuOrder?.length) return products;
  const orderMap = new Map(skuOrder.map((id, i) => [id, i]));
  return [...products].sort((a, b) => (orderMap.get(a.id) ?? 999999) - (orderMap.get(b.id) ?? 999999));
}

export function lookupProductCount(counts, navPath, categories) {
  if (!counts) return null;
  const key = productCountKey(navPath, categories);
  if (counts[key] != null) return counts[key];
  // Fallback for legacy count keys stored by nav id
  const legacy = Array.isArray(navPath) ? navPath.join('/') : '';
  return legacy ? counts[legacy] ?? null : counts[''];
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

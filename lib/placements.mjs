/**
 * Additional category placements (migration 049).
 *
 * website_stock.category + subcategory_one..four remain the canonical PRIMARY
 * placement; product_placements rows are the extra locations a product should
 * also appear under. Paths are arrays of stable taxonomy node ids, the same
 * shape as website_stock.mottaro_path.
 *
 * Everything here is pure, so the path logic is cheap to unit test.
 *
 * SHARED MODULE — this file is byte-identical in protoportal-admin and
 * Proto-Website-, following the same convention as lib/mottaro-category.mjs.
 * Both repos must agree on how a placement path is normalized and merged, or
 * a product appears under different categories in the admin and on the site.
 * Change it in one repo and copy it verbatim to the other.
 */

/**
 * Normalize a placement path to clean node ids.
 * Accepts a real array or the jsonb column arriving as a JSON string.
 * Returns null when there is no usable path, so callers can skip in one check.
 */
export function normalizePlacementPath(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const path = raw.map((segment) => String(segment ?? '').trim()).filter(Boolean);
  return path.length ? path : null;
}

/** Stable string key for a path, for dedupe and Map lookups. */
export function placementPathKey(path) {
  return (Array.isArray(path) ? path : []).join('/');
}

/** Group product_placements rows into a sku -> paths[] map. */
export function buildPlacementMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const sku = String(row?.website_sku || '').trim();
    if (!sku) continue;
    const path = normalizePlacementPath(row?.node_path);
    if (!path) continue;
    if (!map.has(sku)) map.set(sku, []);
    map.get(sku).push(path);
  }
  return map;
}

/**
 * Full ordered path list for a product: primary first, then placements.
 * An empty primary (uncategorised) is dropped rather than emitted as a
 * phantom placement, and duplicates collapse by path key.
 */
export function mergeCategoryPaths(primaryPath, extraPaths) {
  const out = [];
  const seen = new Set();

  const push = (candidate) => {
    const path = normalizePlacementPath(candidate);
    if (!path) return;
    const key = placementPathKey(path);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(path);
  };

  push(primaryPath);
  for (const candidate of extraPaths || []) push(candidate);
  return out;
}

/**
 * Validate an add/remove placement request body.
 * Returns { sku, path } or { error } so the route stays a thin shell.
 */
export function parsePlacementInput(body) {
  const sku = String(body?.websiteSku ?? '').trim();
  if (!sku) return { error: 'websiteSku is required' };
  const path = normalizePlacementPath(body?.nodePath);
  if (!path) return { error: 'nodePath must be a non-empty array of category node ids' };
  return { sku, path };
}

/**
 * Every distinct node id across a product's paths.
 *
 * Returned as a Set so a product filed under both an ancestor and one of its
 * descendants increments each node exactly once — counting per path instead
 * would over-report the shared ancestors.
 */
export function collectCountableNodeIds(paths) {
  const ids = new Set();
  for (const candidate of paths || []) {
    const path = normalizePlacementPath(candidate);
    if (!path) continue;
    for (const id of path) ids.add(id);
  }
  return ids;
}

/**
 * Skus whose ADDITIONAL placements fall under a browse path.
 *
 * Matching is prefix-based and depth-aware, mirroring filterByCategoryPath:
 * a placement counts if the browse path is a prefix of it, so browsing
 * "Art Supplies" finds something placed at "Art Supplies > Paint", but
 * browsing "Art Supplies > Paint" does not surface a product placed only at
 * the shallower "Art Supplies".
 *
 * Returns an empty Set for an empty browse path — the root listing already
 * shows everything, so there is nothing extra to pull in.
 */
export function skusMatchingBrowsePath(placementMap, browsePath) {
  const target = normalizePlacementPath(browsePath);
  const out = new Set();
  if (!target || !placementMap) return out;

  for (const [sku, paths] of placementMap) {
    for (const candidate of paths || []) {
      const path = normalizePlacementPath(candidate);
      if (!path || path.length < target.length) continue;
      if (target.every((segment, i) => path[i] === segment)) {
        out.add(sku);
        break;
      }
    }
  }
  return out;
}

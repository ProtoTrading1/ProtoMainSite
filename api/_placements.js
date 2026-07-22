/**
 * Additional category placements (migration 049).
 *
 * Pure path logic lives in lib/placements.mjs, shared byte-identical with the
 * website repo. This module adds the admin-only, DB- and flag-aware loader.
 */
export {
  buildPlacementMap,
  collectCountableNodeIds,
  mergeCategoryPaths,
  normalizePlacementPath,
  parsePlacementInput,
  placementPathKey,
  skusMatchingBrowsePath,
} from '../lib/placements.mjs';

import { buildPlacementMap } from '../lib/placements.mjs';
import { readFeatureFlags } from './_feature-flags.js';

/**
 * Load every placement as a sku -> paths[] Map, or null when the feature is off.
 *
 * Returning null (rather than an empty Map) lets callers distinguish "feature
 * disabled — behave exactly as before" from "enabled but nothing placed yet",
 * and keeps the disabled path free of any extra query.
 *
 * The whole table is read in one pass because callers need arbitrary sku
 * lookups across a full catalogue scan; it holds only additional placements,
 * so it stays far smaller than website_stock.
 */
export async function loadPlacementMapIfEnabled(supabase, { force = false } = {}) {
  const flags = await readFeatureFlags({ force });
  if (!flags.multiPlacement) return null;

  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('product_placements')
      .select('website_sku,node_path')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return buildPlacementMap(rows);
}

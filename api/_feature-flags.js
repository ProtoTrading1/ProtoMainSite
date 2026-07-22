import { readSiteConfigJson } from './_site-config.js';

/**
 * Runtime feature flags, stored in site-config so a feature can be switched
 * off without a deploy.
 *
 * Empty tables are NOT a sufficient rollback: once placements or groups exist,
 * a bad read path has to be disableable without destroying the data that took
 * an admin an afternoon to enter. That is what these are for.
 *
 * Everything defaults to OFF, and only a real boolean `true` turns a feature
 * on — a half-written or hand-edited store can never enable a feature by
 * accident.
 */

export const FEATURE_FILE = 'features/flags.json';

export const FEATURE_DEFAULTS = Object.freeze({
  multiPlacement: false,
  catalogGrouping: false,
});

export function normalizeFeatureFlags(store) {
  const source = store && typeof store === 'object' && !Array.isArray(store) ? store : {};
  const flags = {};
  for (const key of Object.keys(FEATURE_DEFAULTS)) {
    flags[key] = source[key] === true;
  }
  return flags;
}

let cached = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

/** Feature flags, cached briefly so a hot read path does not refetch per row. */
export async function readFeatureFlags({ force = false } = {}) {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const store = await readSiteConfigJson(FEATURE_FILE, {});
    cached = normalizeFeatureFlags(store);
  } catch {
    // Never let a config read failure take down the catalogue — fail to the
    // documented default, which is "feature off, behave exactly as before".
    cached = normalizeFeatureFlags(null);
  }
  cachedAt = Date.now();
  return cached;
}

export function invalidateFeatureFlags() {
  cached = null;
  cachedAt = 0;
}

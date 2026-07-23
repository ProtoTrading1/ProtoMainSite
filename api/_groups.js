/**
 * Variant grouping (migration 052) — website read-side loader.
 *
 * Pure map logic lives in lib/product-groups.mjs, byte-shared with admin. This
 * module adds the flag-gated DB loader. Collapse itself happens client-side in
 * src/lib/productGroups.js via variantGroupKey; the API only stamps group fields
 * onto each row so the client can pick them up.
 */
import { buildGroupMaps } from '../lib/product-groups.mjs';
import { readFeatureFlags } from './_feature-flags.js';

export { buildGroupMaps } from '../lib/product-groups.mjs';

/**
 * Load a sku -> { groupId, groupPrimarySku, variantLabel, groupTitle } Map, or
 * null when catalogGrouping is off (so the payload stays byte-identical while
 * disabled). Reads only active groups.
 */
export async function loadGroupInfoMapIfEnabled(supabase, { force = false } = {}) {
  const flags = await readFeatureFlags({ force });
  if (!flags.catalogGrouping) return null;

  const { data: groups, error: gErr } = await supabase
    .from('product_groups')
    .select('id,title,primary_website_sku,active')
    .eq('active', true);
  if (gErr) throw gErr;
  if (!groups?.length) return new Map();

  const ids = groups.map((g) => g.id);
  const members = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('product_group_members')
      .select('group_id,website_sku,variant_label,sort_order')
      .in('group_id', ids)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    members.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const byGroup = new Map();
  for (const m of members) {
    if (!byGroup.has(m.group_id)) byGroup.set(m.group_id, []);
    byGroup.get(m.group_id).push(m);
  }
  const groupsWithMembers = groups.map((g) => ({ ...g, members: byGroup.get(g.id) || [] }));
  return buildGroupMaps(groupsWithMembers).bySku;
}

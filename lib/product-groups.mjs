// Pure variant-grouping helpers (no Supabase imports) — byte-shared with the
// admin repo. Builds the sku → group-info lookup used by the read paths.

export function normalizeMemberSku(sku) {
  return String(sku || '').trim().toUpperCase();
}

/**
 * Build lookup maps from active groups (each `{ id, title, primary_website_sku,
 * active, members: [{ website_sku, variant_label, sort_order }] }`).
 *
 * Returns:
 *  - bySku: Map(sku -> { groupId, groupPrimarySku, groupTitle, variantLabel,
 *                        isPrimary, active })
 *  - nonPrimaryMemberSkus: string[] — members to SUPPRESS from a collapsed
 *    listing (every member that isn't its group's primary). Only active groups
 *    contribute.
 */
export function buildGroupMaps(groups = []) {
  const bySku = new Map();
  const nonPrimaryMemberSkus = [];
  for (const g of groups || []) {
    if (g?.active === false) continue;
    const primary = normalizeMemberSku(g?.primary_website_sku);
    for (const m of g?.members || []) {
      const sku = normalizeMemberSku(m?.website_sku);
      if (!sku) continue;
      const isPrimary = sku === primary;
      bySku.set(sku, {
        groupId: g.id,
        groupPrimarySku: primary,
        groupTitle: g.title || null,
        variantLabel: m.variant_label || null,
        isPrimary,
        active: g.active !== false,
      });
      if (!isPrimary) nonPrimaryMemberSkus.push(sku);
    }
  }
  return { bySku, nonPrimaryMemberSkus };
}

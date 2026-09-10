/** Exact identifiers only: never turn a visual filename similarity into a duplicate. */
export function normalizeCatalogueIdentifier(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function identifiers(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const result = [];
  for (const field of ['sku', 'code', 'barcode']) {
    const value = row[field];
    if (value != null && typeof value !== 'string') return null;
    const key = normalizeCatalogueIdentifier(value);
    if (key) result.push({ field, key });
  }
  return result;
}

export function evaluateInstoreDuplicate(candidate, lookup) {
  const hold = (reason) => ({ decision: 'hold', canImport: false, label: 'Review required', reason });
  const keys = identifiers(candidate);
  if (!keys?.length) return hold('invalid_candidate_identifiers');
  if (!lookup || lookup.error || lookup.status !== 'success') return hold('lookup_failed');
  if (lookup.complete !== true || lookup.variantsIncluded !== true || !Array.isArray(lookup.rows)) return hold('lookup_incomplete');
  if (!Array.isArray(lookup.checkedIdentifiers) || !keys.every(({ key }) => lookup.checkedIdentifiers.some((value) => normalizeCatalogueIdentifier(value) === key))) return hold('identifier_coverage_incomplete');
  const rows = [];
  const seen = new Set();
  function collect(row) {
    if (seen.has(row)) return true;
    seen.add(row);
    const ids = identifiers(row);
    if (!ids?.length) return false;
    rows.push(ids);
    if (row.variants != null) {
      if (!Array.isArray(row.variants)) return false;
      for (const variant of row.variants) if (!collect(variant)) return false;
    }
    return true;
  }
  for (const row of lookup.rows) if (!collect(row)) return hold('invalid_catalogue_rows');
  const matches = [];
  for (const existingIds of rows) for (const incoming of keys) for (const existing of existingIds) {
    if (incoming.key === existing.key) matches.push({ identifier: incoming.key, candidateField: incoming.field, catalogueField: existing.field });
  }
  return matches.length
    ? { decision: 'exclude', canImport: false, label: 'Already on main site', reason: 'exact_identifier_match', matches }
    : { decision: 'eligible', canImport: true, label: 'No main-site match', reason: 'complete_lookup_no_match' };
}

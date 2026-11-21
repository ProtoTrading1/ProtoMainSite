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

const hold = (reason) => ({ decision: 'hold', canImport: false, label: 'Review required', reason });

function lookupFailure(lookup) {
  if (!lookup || lookup.error || lookup.status !== 'success') return 'lookup_failed';
  if (lookup.complete !== true || lookup.variantsIncluded !== true || !Array.isArray(lookup.rows)) return 'lookup_incomplete';
  return null;
}

function covers(keys, checkedIdentifiers) {
  return Array.isArray(checkedIdentifiers) && keys.every(({ key }) =>
    checkedIdentifiers.some((value) => normalizeCatalogueIdentifier(value) === key));
}

function collectCatalogueRows(catalogue) {
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
  for (const row of catalogue) if (!collect(row)) return null;
  return rows;
}

function duplicateOutcome(matches) {
  return matches.length
    ? { decision: 'exclude', canImport: false, label: 'Already on main site', reason: 'exact_identifier_match', matches }
    : { decision: 'eligible', canImport: true, label: 'No main-site match', reason: 'complete_lookup_no_match' };
}

export function evaluateInstoreDuplicate(candidate, lookup) {
  const keys = identifiers(candidate);
  if (!keys?.length) return hold('invalid_candidate_identifiers');
  const failure = lookupFailure(lookup);
  if (failure) return hold(failure);
  if (!covers(keys, lookup.checkedIdentifiers)) return hold('identifier_coverage_incomplete');
  const rows = collectCatalogueRows(lookup.rows);
  if (!rows) return hold('invalid_catalogue_rows');
  const matches = [];
  for (const existingIds of rows) for (const incoming of keys) for (const existing of existingIds) {
    if (incoming.key === existing.key) matches.push({ identifier: incoming.key, candidateField: incoming.field, catalogueField: existing.field });
  }
  return duplicateOutcome(matches);
}

/** For a single complete lookup used by multiple candidates, not a cross-request cache. */
export function prepareInstoreDuplicateEvaluator(lookup) {
  let index;
  return (candidate, checkedIdentifiers) => {
    const keys = identifiers(candidate);
    if (!keys?.length) return hold('invalid_candidate_identifiers');
    const failure = lookupFailure(lookup);
    if (failure) return hold(failure);
    if (!covers(keys, checkedIdentifiers)) return hold('identifier_coverage_incomplete');
    if (index === undefined) {
      const rows = collectCatalogueRows(lookup.rows);
      index = rows ? new Map() : null;
      rows?.forEach((ids, row) => ids.forEach(({ key, field }, position) => {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ row, position, field });
      }));
    }
    if (!index) return hold('invalid_catalogue_rows');

    // Rich results retain depth-first catalogue-row order, then candidate
    // field and catalogue field order, including repeated field-pair matches.
    const hits = keys.flatMap(({ key, field }, candidatePosition) =>
      (index.get(key) ?? []).map((existing) => ({
        identifier: key, candidateField: field, catalogueField: existing.field,
        row: existing.row, position: existing.position, candidatePosition,
      })));
    hits.sort((a, b) => a.row - b.row || a.candidatePosition - b.candidatePosition || a.position - b.position);
    return duplicateOutcome(hits.map(({ identifier, candidateField, catalogueField }) =>
      ({ identifier, candidateField, catalogueField })));
  };
}

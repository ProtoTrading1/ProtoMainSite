// The Positill index currently contains more than 40,000 sellable codes.
// Keep a finite guardrail against an accidental unbounded read, but do not
// mistake a complete catalogue of that size for a partial response.
export const MAX_COMPLETE_CATALOGUE_ROWS = 100_000;

// Read every page before making an eligibility decision. A partial normal
// catalogue read would make the "not already on main site" rule unsafe.
export async function readCompleteRows(makeQuery, { allowChangingCount = false } = {}) {
  const page = (offset) => makeQuery().order('sku', { ascending: true }).range(offset, offset + 999);
  const first = await page(0);
  if (first.error) throw new Error(`Catalogue lookup incomplete: ${first.error.message || 'initial query failed'}`);
  if (!Array.isArray(first.data)) throw new Error('Catalogue lookup incomplete: initial data was not an array');
  if (!Number.isInteger(first.count) || first.count < 0 || first.count > MAX_COMPLETE_CATALOGUE_ROWS) throw new Error(`Catalogue lookup incomplete: initial count ${String(first.count)}`);
  if (first.count === 0) return [];

  // We know the complete page count after the first request. Parallel page
  // reads keep the preview below the browser's request timeout as the staged
  // catalogue grows, without relaxing production's consistency requirement.
  const pages = Math.ceil(first.count / 1000);
  const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => page((index + 1) * 1000)));
  const responses = [first, ...remaining];
  const invalidResponse = responses.find(({ data, error, count }) => error || !Array.isArray(data) || !Number.isInteger(count) || count < 0 || count > MAX_COMPLETE_CATALOGUE_ROWS || (!allowChangingCount && count !== first.count));
  if (invalidResponse) {
    if (invalidResponse.error) throw new Error(`Catalogue lookup incomplete: ${invalidResponse.error.message || 'page query failed'}`);
    if (!Array.isArray(invalidResponse.data)) throw new Error('Catalogue lookup incomplete: page data was not an array');
    throw new Error(`Catalogue lookup incomplete: page count ${String(invalidResponse.count)} did not match ${String(first.count)}`);
  }
  const rows = responses.flatMap(({ data }) => data);
  if (!allowChangingCount && rows.length !== first.count) throw new Error('Catalogue lookup truncated');
  return rows;
}

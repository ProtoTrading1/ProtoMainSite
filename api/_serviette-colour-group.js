// The solid colours share a Positill barcode with printed serviettes. Keep this
// family distinct without switching on catalogue-wide grouping.
const COLOURS = [
  ['BLK', 'Black'], ['BLU', 'Blue'], ['DPNK', 'Dark Pink'],
  ['GRY', 'Grey'], ['GRN', 'Green'], ['LPNK', 'Light Pink'],
  ['LPUR', 'Light Purple'], ['ORG', 'Orange'], ['RED', 'Red'],
  ['YEL', 'Yellow'], ['DPUR', 'Dark Purple'], ['DBLU', 'Dark Blue'],
];

export function withServietteColourGroup(existing) {
  const skus = COLOURS.map(([suffix]) => `8636276005-${suffix}`);
  // A group configured through Admin takes precedence over this fallback.
  if (skus.some((sku) => existing?.has(sku))) return existing;
  const result = new Map(existing || []);
  COLOURS.forEach(([suffix, variantLabel]) => result.set(`8636276005-${suffix}`, {
    groupId: 'solid-serviettes-8636276005',
    groupPrimarySku: '8636276005-BLK',
    groupTitle: 'SERVIETTES 2 PLY PKT,20',
    variantLabel,
  }));
  return result;
}

export function servietteBaseGroupId(identifier, groupInfo) {
  return identifier === '8636276005'
    ? groupInfo?.get('8636276005-BLK')?.groupId || null
    : null;
}

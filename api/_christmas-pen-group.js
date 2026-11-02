// Explicit, scoped grouping for the ten separately stocked Christmas pens.
// Do not enable the global admin grouping flag or alter the source SKUs.
const PEN_STYLES = [
  ['8622000156', 'Bear in Santa hat'],
  ['8622000154', 'Candy cane & bow'],
  ['8622000162', 'Christmas sleigh'],
  ['8622000155', 'Christmas tree'],
  ['8622000160', 'Christmas wreath'],
  ['8622000159', 'Gift with bow'],
  ['8622000163', 'Santa face'],
  ['8622000157', 'Santa with holly'],
  ['8622000158', 'Snowman with gift'],
  ['8622000161', 'Truck with gifts'],
];

export function withChristmasPenGroup(existing) {
  // An independently configured admin group wins. Do not split or overwrite
  // it if any of these SKUs is later assigned by the normal admin workflow.
  if (PEN_STYLES.some(([sku]) => existing?.has(sku))) return existing;
  const result = new Map(existing || []);
  for (const [sku, variantLabel] of PEN_STYLES) {
    result.set(sku, {
      groupId: 'christmas-pens-8622000156',
      groupPrimarySku: '8622000156',
      groupTitle: 'BALL PEN BEAR IN SANTA HAT',
      variantLabel,
    });
  }
  return result;
}

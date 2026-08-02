export function normalizeUnitsOfIssue(value, fallback = 'EACH') {
  let raw = String(value ?? '').trim().toUpperCase();
  if (!raw) raw = String(fallback ?? '').trim().toUpperCase();
  if (!raw) return 'EACH';

  raw = raw
    .replace(/[×*]/g, ' X ')
    .replace(/[,;]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(?:EA|EACH|SINGLE|1)$/.test(raw)) return 'EACH';
  if (/^(?:PR|PAIR)$/.test(raw)) return 'PAIR';
  if (/^(?:DZ|DOZ|DOZEN|12)$/.test(raw)) return 'DOZEN';
  if (/^(?:M|METER|METERS|METRE|METRES)$/.test(raw)) return 'METRE';

  const counted = raw.match(/^(PACK|PK|PKT|PACKET|BAG|BOX|SET|CARD)\s*(?:OF|X)?\s*(\d{1,5})$/);
  if (counted) {
    const type = ['PK', 'PKT', 'PACKET'].includes(counted[1]) ? 'PACK' : counted[1];
    return `${type} ${Number(counted[2])}`;
  }

  return raw.slice(0, 40);
}

export function sellingUnitDetails(value) {
  const code = normalizeUnitsOfIssue(value);
  const counted = code.match(/^(PACK|BAG|BOX|SET|CARD) (\d+)$/);
  if (counted) {
    const noun = counted[1][0] + counted[1].slice(1).toLowerCase();
    return {
      code,
      label: `${noun} of ${counted[2]}`,
      priceSuffix: `per ${noun.toLowerCase()}`,
      unitsPerSellingUnit: Number(counted[2]),
    };
  }

  const known = {
    EACH: ['Each', 'per item', 1],
    PAIR: ['Pair', 'per pair', 2],
    SET: ['Set', 'per set', null],
    DOZEN: ['Dozen', 'per dozen', 12],
    BAG: ['Bag', 'per bag', null],
    BOX: ['Box', 'per box', null],
    ROLL: ['Roll', 'per roll', null],
    METRE: ['Metre', 'per metre', null],
  };
  const [label, priceSuffix, unitsPerSellingUnit] = known[code]
    || [code[0] + code.slice(1).toLowerCase(), `per ${code.toLowerCase()}`, null];
  return { code, label, priceSuffix, unitsPerSellingUnit };
}

export function sellingUnitLabel(value) {
  return sellingUnitDetails(value).label;
}

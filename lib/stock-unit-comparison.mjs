import {normalizeUnitsOfIssue} from './selling-unit.mjs';

// Comparison only: never change stored/display units or multiply source stock.
// Inspect original evidence before the general normalizer removes hyphens.
export function stockUnitComparisonKey(value) {
  if(typeof value!=='string'||!value.trim()||value.length>64||/[\r\n\u0000]/.test(value))return null;
  const raw=value.trim().toUpperCase(),pieces=raw.match(/^([1-9][0-9]{0,4})\s*PCS?$/);
  if(pieces)return `${pieces[1]}PC`;
  if(raw.includes('PC'))return null;
  return normalizeUnitsOfIssue(value,'');
}

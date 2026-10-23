import {normalizeUnitsOfIssue, sellingUnitDetails} from './selling-unit.mjs';

// Only the exact Positill row supplies an Instore selling unit. A title such
// as "3PC" describes the product; it must not invent a pack conversion.
export function positillUnitObservation(sku, row) {
  const canonical=String(sku || '').trim().toUpperCase();
  if (!canonical || String(row?.CODE || '').trim().toUpperCase()!==canonical) throw new Error('Positill returned a different product');
  const raw=typeof row?.UNITS==='string' ? row.UNITS.trim().toUpperCase() : '';
  if (!raw || raw.length>40 || !/[A-Z]/.test(raw) || /^(UNKNOWN|UNVERIFIED|N\/A|NONE|NULL)$/.test(raw)) throw new Error('Positill selling unit needs verification');
  const unit=normalizeUnitsOfIssue(raw, '');
  return {sku:canonical,unitsOfIssue:unit,unitsOfIssueRaw:raw,unitsOfIssueSource:'positill_live',unitsOfIssueVerified:true};
}

export function hasVerifiedInstoreUnit(product) {
  return product?.unitsOfIssueVerified===true && product?.unitsOfIssueSource==='positill_live' && Boolean(String(product?.unitsOfIssue || '').trim());
}

export function productSellingUnit(product) {
  if (product?.isExtendedRange && !hasVerifiedInstoreUnit(product)) return {code:'',label:'Unit needs checking',priceSuffix:'selling unit unverified',unitsPerSellingUnit:null};
  return sellingUnitDetails(product?.unitsOfIssue);
}

export function withPositillObservation(product, observation) {
  if (!product?.isExtendedRange) return product;
  const sku=String(product.sku || product.id || product.code || '').trim().toUpperCase();
  if (observation?.sku!==sku || !hasVerifiedInstoreUnit(observation)) return {...product,unitsOfIssue:null,unitsOfIssueVerified:false,unitsOfIssueSource:null};
  return {...product,...observation,stockQty:observation.qty,stockOnHand:observation.qty,availability:observation.availability};
}

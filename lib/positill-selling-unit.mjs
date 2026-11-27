import {normalizeUnitsOfIssue, sellingUnitDetails} from './selling-unit.mjs';

// Exact reviewed source contracts backed by existing website units and product
// packaging evidence. These preserve source units; stock is never multiplied.
const REVIEWED_NUMERIC_UNITS=Object.freeze({
  '8615207001':Object.freeze({raw:'1',description:'ELASTIC CORD 0.7MM*+-100M'}),
  'MC085-1':Object.freeze({raw:'4+1',description:'MOTARRO 4PC WHITEBOARD MARKER +ERASER'}),
  'MU146-1':Object.freeze({raw:'27',description:'MOTARRO FLASH CARDS ADDITION 27-SHEETS'}),
});

// Only the exact Positill row supplies an Instore selling unit. A title such
// as "3PC" describes the product; it must not invent a pack conversion.
export function positillUnitObservation(sku, row) {
  const canonical=String(sku || '').trim().toUpperCase();
  if (!canonical || String(row?.CODE || '').trim().toUpperCase()!==canonical) throw new Error('Positill returned a different product');
  const raw=typeof row?.UNITS==='string' ? row.UNITS.trim().toUpperCase() : '';
  const reviewed=REVIEWED_NUMERIC_UNITS[canonical];
  const reviewedNumeric=reviewed?.raw===raw && reviewed.description===String(row?.DESCR || '').trim().toUpperCase();
  if (!raw || raw.length>40 || (!/[A-Z]/.test(raw) && !reviewedNumeric) || /^(UNKNOWN|UNVERIFIED|N\/A|NONE|NULL)$/.test(raw)) throw new Error('Positill selling unit needs verification');
  let unit=normalizeUnitsOfIssue(raw, '');
  if (/^(?:PACK|BOX|BAG|SET|CARD) 0$/.test(unit)) {
    const description=String(row?.DESCR || '').trim().toUpperCase();
    if (canonical==='8640000227' && description==='BALLOONS 12INCH PKT,100 WHITE' && /^PKT\s*[,;]\s*00$/.test(raw)) unit='PACK 100';
    else throw new Error('Positill pack size needs verification');
  }
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

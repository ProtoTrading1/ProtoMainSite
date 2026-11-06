// Explicitly supplied, website-only overrides. Source identity, stock and
// price are never accepted from this store and remain authoritative.
export async function applyWebsiteMetadata(rows, provider) {
  if (!provider) return rows;
  if (!Array.isArray(rows)) throw Error('Incomplete Instore source');
  const result=await provider(rows.map(row=>row.sku));
  if (!result || result.complete!==true || !Array.isArray(result.overlays)) throw Error('Website metadata unavailable');
  const bySku=new Map();
  for (const item of result.overlays) {
    const sku=typeof item?.sku==='string'?item.sku.trim().toUpperCase():'';
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(sku) || bySku.has(sku)
      || typeof item.description!=='string' || !item.description.trim() || item.description.length>200
      || [...item.description].some(char=>char.codePointAt(0)<32 || char.codePointAt(0)===127)
      || typeof item.barcode!=='string' || !/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(item.barcode)) throw Error('Invalid website metadata');
    bySku.set(sku,item);
  }
  return rows.map(row=>{
    const item=bySku.get(String(row.sku||'').trim().toUpperCase());
    if (!item) return row;
    const sourceBarcode=String(row.barcode||row.sku||'').trim().toUpperCase();
    if (item.barcode.trim().toUpperCase()!==sourceBarcode) throw Error('Website metadata barcode does not match source');
    return {...row,title:item.description.trim(),original_description:item.description.trim(),websiteDescriptionOverride:true};
  });
}


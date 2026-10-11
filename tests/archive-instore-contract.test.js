import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveInstoreMetadata, attachArchiveInstoreMetadata, resolveArchiveInstoreLine, verifyArchiveInstoreAllocation } from '../api/_archive-instore-contract.js';
import { buildExtendedRangeProducts } from '../api/extended-range.js';
import { resolveInstoreOrderLine } from '../api/send-order.js';
const sku = 'FIXTURE-BLUE';
const key = '00000000-0000-4000-8000-000000000001';
const metadata = { sku, requestId:key, price:12.61, price_source:'positill_website_inclusive', units_of_issue:'PK3', min_order_qty:2 };
const row = { sku, barcode:'FIXTURE', image_source:'nutstore', image_source_key:`archive-review:${key}`, archive_review:metadata, title:'Fixture',price:12.61,available_stock:21,image_url:'https://fixtures.invalid/photo.jpg',image_review_status:'verified',visibility_status:'search_only',is_active:true };
const pos = { CODE:'FIXTURE',UNITS:'PK3',ONHAND:24,BOOKED:3,website_price_incl_vat:12.61,website_price_source:'positill_website_inclusive',PRICE_A:10.97 };
const item={qty:2,product:{sku,isExtendedRange:true,price:0.01}};
test('archive-routed discovery preserves inclusive fingerprint prices and canonical packs',()=>{
  const [product]=buildExtendedRangeProducts([row]);assert.equal(product.price,12.61);assert.equal(product.unitsOfIssue,'PACK 3');assert.equal(product.minQty,2);
});
test('missing, mismatched or rewritten provenance holds only archive-routed products',()=>{
  const legacy={...row,sku:'LEGACY',image_source_key:'nutstore:legacy',archive_review:undefined};
  for(const patch of [{archive_review:null},{price:14.5},{archive_review:{...metadata,requestId:'different'}}]) {
    const products=buildExtendedRangeProducts([{...row,...patch},legacy]);assert.deepEqual(products.map(p=>p.sku),['LEGACY']);
  }
});
test('archive-routed checkout uses exact base POS identity and inclusive price once',()=>{
  const result=resolveInstoreOrderLine(item,{indexRow:row,bridgeRow:pos});assert.equal(result.product.price,12.61);assert.equal(result.product.unitsOfIssue,'PACK 3');assert.equal(result.product.minQty,2);
});
test('archive-routed checkout holds stale inclusive price, units and unavailable live stock',()=>{
  for(const patch of [{CODE:sku},{UNITS:'EACH'},{ONHAND:12,BOOKED:3},{BOOKED:null},{website_price_incl_vat:14.5},{website_price_source:undefined}]) assert.throws(()=>resolveArchiveInstoreLine(item,row,{...pos,...patch}));
  assert.throws(()=>resolveArchiveInstoreLine({...item,qty:22},row,pos));
  assert.throws(()=>resolveArchiveInstoreLine({...item,qty:1},row,pos));
});
test('combined variant quantities cannot consume the same base stock twice',()=>{
  const second={...row,sku:'FIXTURE-GREEN'};
  assert.throws(()=>verifyArchiveInstoreAllocation([{...item,qty:12},{qty:12,product:{sku:second.sku}}],[row,second],new Map([['FIXTURE',pos]])),/Combined/);
});
test('missing review schema holds routed rows and preserves unrelated legacy records',async()=>{
  const legacy={sku:'LEGACY'};const client={rpc:async()=>({error:{code:'PGRST202'},data:null})};
  const result=await attachArchiveInstoreMetadata(client,[row,legacy]);assert.equal(archiveInstoreMetadata(result[0]),null);assert.deepEqual(result[1],legacy);
});
test('review metadata reads are exact and do not run for legacy-only feeds',async()=>{
  let calls=0;const client={rpc:async(name,args)=>{calls++;assert.equal(name,'archive_review_catalogue_metadata');assert.deepEqual(args.p_skus,[sku]);return{data:[metadata],error:null};}};
  const [attached]=await attachArchiveInstoreMetadata(client,[row]);assert.equal(archiveInstoreMetadata(attached).price,12.61);
  await attachArchiveInstoreMetadata(client,[{sku:'LEGACY'}]);assert.equal(calls,1);
});
test('exactly ten selling units qualifies in discovery and checkout; nine stays held',()=>{
  assert.equal(buildExtendedRangeProducts([{...row,available_stock:10}]).length,1);
  assert.equal(resolveArchiveInstoreLine(item,row,{...pos,ONHAND:13,BOOKED:3}).price,12.61);
  assert.equal(buildExtendedRangeProducts([{...row,available_stock:9}]).length,0);
  assert.throws(()=>resolveArchiveInstoreLine(item,row,{...pos,ONHAND:12,BOOKED:3}));
});

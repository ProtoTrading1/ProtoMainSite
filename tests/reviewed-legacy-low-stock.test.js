import test from 'node:test';
import assert from 'node:assert/strict';
import {overlayArrivedStock,assertArrivedOrderTotals} from '../api/_arrived-stock.js';
import {applyInstoreImageControls,buildExtendedRangeProducts,excludeMainCatalogueProducts} from '../api/extended-range.js';
import {resolveInstoreOrderLine} from '../api/send-order.js';
import {reviewedLegacyLowStockEligible} from '../lib/reviewed-legacy-low-stock.mjs';

const cases=[
  {sku:'8630000031',title:'WET WIPES CYLINDER - CARTOON DESIGNS',price:12.5,ex:10.87,stock:1,cached:125,photo:'84f3f379-ec8f-409e-8a48-2092d6dfc35a'},
  {sku:'8781830027',title:'COOLER BAG WITH SHOULDER STRAP - GREY',price:159,ex:138.26,stock:9,cached:10,photo:'985408ab-8190-4c2c-bc51-0ca3b218bef6'},
];
const base=c=>({sku:c.sku,barcode:c.sku,title:c.title,original_description:c.title,price:c.price,available_stock:c.cached,supplier_name:'POSITILL',image_source:'nutstore',image_source_key:`local-folder-live:${c.sku}.jpg`,image_url:`https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/instore/${c.sku}/${c.photo}.jpg`,minimum_stock:1,image_review_status:'verified',visibility_status:'search_only',is_active:true,category:'Reviewed existing category'});
const receipt=c=>({code:c.sku,quantity:150,units:'EACH',status:'receiving-recorded'});
const bridge=(c,qty=c.stock)=>({CODE:c.sku,DESCR:c.title,UNITS:'EACH',ONHAND:qty,BOOKED:0,PRICE_A:c.ex});
async function observe(c,{row=base(c),qty=c.stock,source=bridge(c,qty),arrival=receipt(c),enabled=true,fail=false}={}){
 return (await overlayArrivedStock([row],{env:enabled?{INSTORE_ARRIVED_STOCK_ENABLED:'1'}:{},client:{rpc:async()=>({data:arrival?[arrival]:[]})},read:async()=>{if(fail)throw Error('offline');return source;}}))[0];
}

for(const c of cases){
 test(c.sku+' fresh overlay restores exact positive-stock discovery without changing the stored row',async()=>{
  const stored=base(c),before=structuredClone(stored),observed=await observe(c,{row:stored});
  assert.deepEqual(stored,before);assert.equal(observed.available_stock,c.stock);assert.equal(observed.price,c.price);
  const controlled=applyInstoreImageControls([observed],new Map(),new Map());
  const [product]=buildExtendedRangeProducts(controlled,c.sku);assert.ok(product);
  assert.equal(product.stockQty,c.stock);assert.equal(product.stockOnHand,c.stock);assert.equal(product.price,c.price);
  assert.equal(product.sku,c.sku);assert.equal(product.barcode,c.sku);assert.equal(product.image,stored.image_url);assert.equal(product.name,c.title);
  assert.equal(observed.image_source_key,stored.image_source_key);assert.ok(!observed.image_source_key.startsWith('archive-publication'));
  assert.equal(excludeMainCatalogueProducts([product],[{sku:c.sku,barcode:c.sku}]).length,0);
  const order=resolveInstoreOrderLine({qty:1,product:{sku:c.sku,image:'https://forged.invalid/a',price:0.01,unitsOfIssue:'EACH'}},{indexRow:stored,bridgeRow:bridge(c)});
  assert.equal(order.product.price,c.price);assert.equal(order.product.unitsOfIssue,'EACH');assert.equal(order.product.image,stored.image_url);
  const records=new Map([[c.sku,receipt(c)]]),sources=new Map([[c.sku,bridge(c)]]);
  assert.doesNotThrow(()=>assertArrivedOrderTotals([{qty:c.stock,product:{sku:c.sku}}],records,sources));
  assert.throws(()=>assertArrivedOrderTotals([{qty:c.stock,product:{sku:c.sku}},{qty:1,product:{sku:c.sku}}],records,sources),/only/);
 });
 test(c.sku+' only fresh received exact EACH observations qualify',async()=>{
  const cached={...base(c),available_stock:9,reviewedLegacyLiveStock:true};assert.equal(buildExtendedRangeProducts([cached]).length,0);
  for(const options of [{row:cached,enabled:false},{row:cached,arrival:null},{row:cached,fail:true},{source:{...bridge(c),CODE:'OTHER'}},{source:{...bridge(c),UNITS:'PACK 10'}},{source:{...bridge(c),ONHAND:null}},{source:{...bridge(c),PRICE_A:0}}]){
   assert.equal(buildExtendedRangeProducts([await observe(c,options)]).length,0);
  }
  for(const qty of [0,-1])assert.equal(buildExtendedRangeProducts([await observe(c,{qty})]).length,0);
  const observed=await observe(c);assert.ok(reviewedLegacyLowStockEligible(observed));
  assert.equal(buildExtendedRangeProducts([JSON.parse(JSON.stringify(observed))]).length,0);
  assert.equal(reviewedLegacyLowStockEligible({...observed,available_stock:observed.available_stock+1}),false);
 });
 test(c.sku+' changed identity/provenance/photo and normal hide controls stay closed below threshold',async()=>{
  const fields=[{sku:c.sku+'X'},{barcode:'OTHER'},{supplier_name:'OTHER'},{image_source:'other'},{image_source_key:'local-folder-live:OTHER.jpg'},{image_url:base(c).image_url+'?changed=1'},{minimum_stock:10},{image_review_status:'pending'},{visibility_status:'hidden'},{is_active:false}];
  for(const changed of fields){const row={...base(c),...changed,available_stock:9};const observed=await observe(c,{row,arrival:{...receipt(c),code:row.sku}});assert.equal(buildExtendedRangeProducts([observed]).length,0,JSON.stringify(changed));}
  const observed=await observe(c);
  assert.equal(buildExtendedRangeProducts(applyInstoreImageControls([observed],new Map(),new Map([[c.sku,'hidden']]))).length,0);
  const [hiddenImage]=buildExtendedRangeProducts(applyInstoreImageControls([observed],new Map([[c.sku,'hidden']])));assert.equal(hiddenImage.image,'');assert.equal(hiddenImage.imageStatus,'hidden');
 });
}
test('unrelated local-folder imports keep the original greater-than-ten discovery threshold',async()=>{
 const row={...base(cases[0]),sku:'8630000032',barcode:'8630000032',available_stock:9};
 assert.equal(buildExtendedRangeProducts([row]).length,0);
 assert.equal(buildExtendedRangeProducts([{...row,available_stock:10}]).length,0);
 assert.equal(buildExtendedRangeProducts([{...row,available_stock:11}]).length,1);
});

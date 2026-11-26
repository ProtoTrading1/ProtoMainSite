import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { adapt } from '../api/products.js';
import { SARONGI_GALLERIES, REVIEWED_FRAME_GALLERIES } from '../lib/sarongi-instore-gallery-data.mjs';
import { sarongiInstoreGallery, reviewedFrameStockImages } from '../lib/sarongi-instore-gallery.mjs';
import { reviewedColourOptions, withReviewedColourPhoto, reviewedColourOrderImage } from '../lib/reviewed-colour-options.mjs';
import { addBasketLine } from '../lib/basket-lines.mjs';
import { resolveAuthoritativePrices } from '../api/send-order.js';
const origin='https://admin.proto.co.za';
const rowFor=sku=>({sku,barcode:sku,title:'PHOTO FRAME A4 CERTIFICATE',price:sku==='1066'?21.5:33,units_of_issue:'EACH',available_stock:sku==='1066'?34:225,stock_qty:sku==='1066'?34:225,image_url_one:origin+REVIEWED_FRAME_GALLERIES[sku][0].path,image_url_two:null,image_url_three:null,image_url_four:null,category:'Homeware'});
const canonical=['id','sku','code','barcode','websiteSku','price','stockQty','stockOnHand','unitsOfIssue'];
for(const [sku,labels] of [['1066',['Gold','Grey']],['2306',['Cream','Grey','Light Brown']]]) {
 test(sku+' actual stock adapter attaches the exact whole gallery and preserves shared identity',()=>{
  const row=rowFor(sku), before=structuredClone(row), product=adapt(row,[]);
  assert.deepEqual(row,before);
  assert.equal(product.image,row.image_url_one);
  assert.equal(product.price,row.price);assert.equal(product.stockOnHand,row.available_stock);
  const options=reviewedColourOptions(product);
  assert.deepEqual(options.map(p=>p.label),labels);assert.ok(options.every(p=>!p.stockAvailable));
  for(const option of options){
   const selected=withReviewedColourPhoto(product,option.label);
   for(const field of canonical)assert.equal(selected[field],product[field],field);
   assert.deepEqual(new Set(selected.images),new Set(product.images));
   assert.equal(selected.image,option.image);assert.equal(selected.remoteImage,option.image);
   assert.equal(reviewedColourOptions(selected).length,labels.length);
   assert.equal(reviewedColourOrderImage(sku,row.image_url_one,option.label),option.image);
  }
  let basket=[];
  for(const option of options)basket=addBasketLine(basket,{product:withReviewedColourPhoto(product,option.label),qty:row.available_stock-1,preference:option.label},{quantityCapForProduct:p=>p.stockOnHand}).items;
  assert.equal(basket.reduce((sum,p)=>sum+p.qty,0),row.available_stock);
  assert.equal(new Set(basket.map(p=>p.product.sku)).size,1);
 });
}
test('frame enrichment and choices fail closed for changed or removed gallery members',()=>{
 for(const sku of ['1066','2306']){
  const row=rowFor(sku), p=adapt(row,[]);
  for(const changed of [{...row,image_url_one:null},{...row,image_url_one:'https://example.invalid/replaced.png'},{...row,image_url_two:'https://example.invalid/extra.png'},{...row,sku:'PLATE'},{...row,image_url_one:null,image_url_two:row.image_url_one}]){
   assert.deepEqual(reviewedFrameStockImages(changed),[changed.image_url_one,changed.image_url_two,changed.image_url_three,changed.image_url_four].filter(Boolean));
   assert.deepEqual(reviewedColourOptions(adapt(changed,[])),[]);
  }
  for(const changed of [{...p,imageStatus:'hidden'},{...p,images:p.images.slice(1)},{...p,images:[p.image,p.image]},{...p,images:[...p.images,'https://example.invalid/x']},{...p,isVariantGroup:true}])assert.deepEqual(reviewedColourOptions(changed),[]);
  assert.equal(reviewedColourOrderImage(sku,'https://example.invalid/replaced.png','Grey'),'https://example.invalid/replaced.png');
 }
 const row=rowFor('2306');row.image_url_two=origin+REVIEWED_FRAME_GALLERIES['2306'][1].path;
 assert.equal(adapt(row,[]).images.length,2);assert.deepEqual(reviewedColourOptions(adapt(row,[])),[]);
});
test('admin origin is trusted only for these exact SKU/path pairs',()=>{
 for(const sku of ['1066','2306']){
  const main=rowFor(sku).image_url_one;
  for(const changed of [main.replace(origin,'https://www.proto.co.za'),main.replace(origin,'http://admin.proto.co.za'),main.replace(origin,'https://admin.proto.co.za:444'),main.replace(origin,'https://evil@admin.proto.co.za'),main+'?x=1',main+'#x',main.replace('.png','.jpg'),rowFor(sku==='1066'?'2306':'1066').image_url_one])assert.deepEqual(sarongiInstoreGallery(sku,changed),[]);
 }
 assert.deepEqual(sarongiInstoreGallery('KANK3201',origin+SARONGI_GALLERIES.KANK3201[0].path),[]);
 assert.equal(Object.keys(SARONGI_GALLERIES).length,38);
 assert.deepEqual(Object.keys(REVIEWED_FRAME_GALLERIES),['1066','2306']);
});
test('authoritative frame checkout ignores forged browser images and prices',async()=>{
 const old={fetch:globalThis.fetch,url:process.env.VITE_STOCK_SUPABASE_URL,key:process.env.VITE_STOCK_SUPABASE_KEY};
 process.env.VITE_STOCK_SUPABASE_URL='https://synthetic-frame-checkout.invalid';process.env.VITE_STOCK_SUPABASE_KEY='synthetic';
 globalThis.fetch=async input=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.hostname,'synthetic-frame-checkout.invalid');const data=url.pathname.endsWith('/website_stock')?['1066','2306'].map(rowFor):url.pathname.endsWith('/get_website_product_availability')?[]:null;assert.notEqual(data,null);return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});};
 try{
  const input=['1066','2306'].flatMap(sku=>REVIEWED_FRAME_GALLERIES[sku].map(p=>({qty:1,preference:p.label,product:{sku,barcode:'FORGED',price:0.01,checkoutSnapshot:{unitPrice:rowFor(sku).price,stockQty:rowFor(sku).available_stock},image:'https://untrusted.invalid/wrong.png'}})));
  const result=await resolveAuthoritativePrices(input,{classify:async()=>new Set()});
  assert.equal(result.length,5);
  for(const item of result){const row=rowFor(item.product.sku);assert.equal(item.product.price,row.price);assert.equal(item.product.unitsOfIssue,'EACH');assert.equal(item.product.image,reviewedColourOrderImage(row.sku,row.image_url_one,item.preference));assert.equal(item.product.remoteImage,item.product.image);}
 }finally{globalThis.fetch=old.fetch;for(const [key,value] of [['VITE_STOCK_SUPABASE_URL',old.url],['VITE_STOCK_SUPABASE_KEY',old.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

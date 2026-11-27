import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import reviewed from '../lib/cat07-reviewed-views.json' with {type:'json'};
import {fixtureReceipt,fixtureProduct} from '../e2e/fixtures/cat07-server-data.mjs';
import {validateCat07Gallery,cat07CustomerOptions} from '../lib/cat07-customer-gallery.mjs';
import {reviewedColourOptions,withReviewedColourPhoto} from '../lib/reviewed-colour-options.mjs';
import {resolveCat07OrderPreview,cat07ManifestHash} from '../lib/cat07-order-preview.mjs';
import {addBasketLine} from '../lib/basket-lines.mjs';
import {instoreQuantityLimit} from '../lib/sarongi-instore-requests.mjs';
import {buildOrderEmailHtml} from '../api/send-order.js';
const now=1800000000000;
const authority=()=>({receipt:structuredClone(fixtureReceipt),indexRow:{sku:reviewed.sku,barcode:reviewed.sku,destination:'instore',image:fixtureProduct.image,hidden:false},source:{authority:'live-exact-code-observation',canonicalCode:reviewed.sku,units:'EACH',priceInclVat:6,onHand:6,booked:0,available:6,observedAt:new Date(now).toISOString()},now});
const line=(label=reviewed.styles[0].label,qty=1)=>({preference:label,qty,product:{sku:reviewed.sku,image:'https://forged.invalid/x',price:0.01,barcode:'forged',unitsOfIssue:'PACK 10'}});
test('eight standalone originals stay byte-exact; private overview is metadata only',async()=>{
 for(const style of reviewed.styles){const bytes=await readFile(new URL('../public/product-images/reviewed/8640000274/'+style.sha256+'.jpg',import.meta.url));assert.equal(bytes.length,style.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),style.sha256);}
 assert.equal(reviewed.overview.sha256,'930d2e5fa8c73656721a0852641ba4a4de70333b6be838b805fa87685151bf73');
});
test('exact nine-view receipt gives eight styles, canonical overview display and no selected preference',()=>{
 assert.equal(validateCat07Gallery(fixtureReceipt),fixtureReceipt);assert.equal(cat07CustomerOptions(fixtureProduct).length,8);assert.equal(fixtureProduct.images.length,9);
 assert.ok(reviewedColourOptions(fixtureProduct).every(option=>option.id!=='overview'));assert.equal(fixtureProduct.image,fixtureReceipt.views[0].image.url);
});
for(const style of reviewed.styles)test(style.label+' retains nine views/one identity and gets a server-owned order photo',()=>{
 const selected=withReviewedColourPhoto(fixtureProduct,style.label);assert.equal(selected.sku,reviewed.sku);assert.equal(selected.stockQty,6);assert.equal(selected.price,6);assert.equal(selected.images.length,9);assert.equal(cat07CustomerOptions(selected).length,8);assert.equal(selected.cat07CanonicalMain,fixtureProduct.image);
 const quote=resolveCat07OrderPreview([line(style.label)],authority());assert.equal(quote.items[0].preference,style.label);assert.equal(quote.items[0].product.image,selected.image);assert.equal(quote.items[0].product.price,6);assert.equal(quote.items[0].product.unitsOfIssue,'EACH');assert.equal(quote.items[0].product.barcode,reviewed.sku);
});
test('pending, changed main/order, hidden, extra/missing/duplicate images never offer choices',()=>{
 for(const p of [{...fixtureProduct,cat07Family:{...fixtureReceipt,status:'pending'}},{...fixtureProduct,image:fixtureProduct.images[1]},{...fixtureProduct,images:[...fixtureProduct.images].reverse()},{...fixtureProduct,images:fixtureProduct.images.slice(1)},{...fixtureProduct,images:[...fixtureProduct.images,fixtureProduct.image]},{...fixtureProduct,imageStatus:'hidden'},{...fixtureProduct,barcode:'other'}])assert.deepEqual(cat07CustomerOptions(p),[]);
});
test('server rejects changed digest/destination/main/label or missing receipt, never browser proof',()=>{
 for(const mutate of [a=>{a.receipt=null;},a=>{a.receipt.views[1].label='forged';},a=>{a.receipt.manifestHash='0'.repeat(64);},a=>{a.receipt.destination='website';a.receipt.manifestHash=cat07ManifestHash(a.receipt);},a=>{a.indexRow.destination='website';},a=>{a.indexRow.image=fixtureReceipt.views[1].image.url;},a=>{a.indexRow.hidden=true;}]){const a=authority();mutate(a);assert.throws(()=>resolveCat07OrderPreview([line()],a));}
 for(const label of ['','Saved family reference overview','unknown','<script>'])assert.throws(()=>resolveCat07OrderPreview([line(label)],authority()));
});
test('all style lines share one current source balance in basket and authoritative preview',()=>{
 let basket=[];for(const style of reviewed.styles.slice(0,2))basket=addBasketLine(basket,{product:withReviewedColourPhoto(fixtureProduct,style.label),preference:style.label,qty:4},{quantityCapForProduct:instoreQuantityLimit}).items;
 assert.deepEqual(basket.map(line=>line.qty),[4,2]);assert.equal(resolveCat07OrderPreview(basket,authority()).totalQuantity,6);
 assert.throws(()=>resolveCat07OrderPreview([line(reviewed.styles[0].label,4),line(reviewed.styles[1].label,3)],authority()),/Only 6/);
 const a=authority();a.source.onHand=3;a.source.available=3;assert.throws(()=>resolveCat07OrderPreview(basket,a),/Only 3/);
});
test('real order renderer receives canonical code, authoritative style images and R36 totals',()=>{
 const quote=resolveCat07OrderPreview([line(reviewed.styles[1].label,4),line(reviewed.styles[2].label,2)],authority());
 const html=buildOrderEmailHtml({customer:{business:'LOCAL PREVIEW ONLY'},items:quote.items,totals:{subtotal:quote.total,total:quote.total}});
 assert.equal(quote.total,36);assert.ok(html.includes('8640000274'));assert.ok(html.includes('R36.00'));
 assert.ok(html.includes('R24.00'));assert.ok(html.includes('R12.00'));
 for(const item of quote.items)assert.ok(html.includes(item.product.image));assert.ok(!html.includes('forged.invalid'));
});
test('zero/negative/unverified/stale source, changed pack and unsafe totals remain held',()=>{
 for(const change of [{onHand:0,available:0},{onHand:-1,available:-1},{booked:-1},{available:null},{available:100},{units:'PACK 10'},{priceInclVat:0},{canonicalCode:'OTHER'},{observedAt:new Date(now-60001).toISOString()},{observedAt:new Date(now+1).toISOString()}]){const a=authority();Object.assign(a.source,change);assert.throws(()=>resolveCat07OrderPreview([line()],a));}
 for(const qty of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>resolveCat07OrderPreview([line(undefined,qty)],authority()));
});

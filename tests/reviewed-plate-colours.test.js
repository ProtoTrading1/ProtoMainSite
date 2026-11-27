import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import plate from '../lib/reviewed-plate-gallery.json' with {type:'json'};
import {withReviewedPlateGallery} from '../lib/reviewed-plate-gallery.mjs';
import {reviewedColourOptions,withReviewedColourPhoto,reviewedColourOrderImage} from '../lib/reviewed-colour-options.mjs';
import {buildExtendedRangeProducts} from '../api/extended-range.js';
import {resolveInstoreOrderLine,buildOrderEmailHtml} from '../api/send-order.js';
import {addBasketLine} from '../lib/basket-lines.mjs';
import {parseCartMutation,cartPayload} from '../api/account-cart.js';
import {instoreQuantityLimit} from '../lib/sarongi-instore-requests.mjs';
const index={sku:plate.sku,barcode:plate.sku,title:'PARTY PLATES 9" 10PCS PLAIN COLOURS',price:11.5,available_stock:1243,image_url:plate.canonicalMainImage,image_source:'nutstore',image_review_status:'verified',visibility_status:'search_only',is_active:true};
const bridge={CODE:plate.sku,DESCR:index.title,UNITS:'10PC',PRICE_A:10,ONHAND:1243,BOOKED:0};
const product=()=>buildExtendedRangeProducts([index])[0];

test('16 original colour assets match their immutable hashes and have distinct labels and photos',async()=>{
 assert.equal(plate.options.length,16);assert.equal(new Set(plate.options.map(p=>p.label)).size,16);assert.equal(new Set(plate.options.map(p=>p.image)).size,16);
 for(const option of plate.options){const bytes=await readFile(new URL('../public'+option.image,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),option.originalSha256);}
});
test('actual Instore adapter preserves collage and source values and offers exactly16 colours, never the overview',()=>{
 const before=structuredClone(index), p=product(), options=reviewedColourOptions(p);
 assert.deepEqual(index,before);assert.equal(p.image,index.image_url);assert.equal(p.images.length,17);
 assert.equal(p.price,11.5);assert.equal(p.stockQty,1243);assert.equal(p.barcode,plate.sku);
 assert.deepEqual(options.map(p=>p.label),plate.options.map(p=>p.label));assert.ok(options.every(p=>!p.stockAvailable));
 assert.ok(options.every(p=>p.image!==plate.canonicalMainImage));
});
for(const option of plate.options)test(option.label+' retains all17 images, shared identity, source unit and authoritative order photo',()=>{
 const p={...product(),unitsOfIssue:'10PC'},selected=withReviewedColourPhoto(p,option.label);
 for(const field of ['sku','id','barcode','price','unitsOfIssue','stockOnHand','stockQty'])assert.equal(selected[field],p[field]);
 assert.equal(selected.image,option.image);assert.equal(reviewedColourOptions(selected).length,16);assert.deepEqual(new Set(selected.images),new Set(p.images));
 const order=resolveInstoreOrderLine({qty:2,preference:option.label,product:{sku:plate.sku,image:'https://forged.invalid/wrong.jpg',price:0.01,unitsOfIssue:'EACH'}},{indexRow:index,bridgeRow:bridge});
 assert.equal(order.preference,option.label);assert.equal(order.product.image,'https://www.proto.co.za'+option.image);assert.equal(order.product.price,11.5);assert.equal(order.product.unitsOfIssue,'10PC');assert.equal(order.product.sku,plate.sku);
 const html=buildOrderEmailHtml({customer:{company:'Isolated test'},items:[order],subtotal:23});assert.ok(html.includes(option.label));assert.ok(html.includes('https://www.proto.co.za'+option.image));assert.ok(!html.includes('forged.invalid'));
});
test('unknown, missing and overview preferences are held instead of silently becoming another colour',()=>{
 for(const preference of [undefined,'','All colours','unknown','<script>'])assert.throws(()=>resolveInstoreOrderLine({qty:1,preference,product:{sku:plate.sku}},{indexRow:index,bridgeRow:bridge}),/Choose a reviewed plate colour/);
});
test('changed, hidden, partial, duplicated and unrelated galleries fail closed',()=>{
 const p=product();
 for(const changed of [{...p,imageStatus:'hidden'},{...p,isVariantGroup:true},{...p,sku:'OTHER'},{...p,image:plate.canonicalMainImage+'?x=1'},{...p,images:p.images.slice(1)},{...p,images:[...p.images,p.images[1]]},{...p,images:p.images.map((url,i)=>i===1?'https://forged.invalid/new.jpg':url)}])assert.deepEqual(reviewedColourOptions(changed),[]);
 for(const main of [plate.canonicalMainImage+'?x=1',plate.canonicalMainImage.replace('https:','http:'),'https://example.invalid/new.jpg']){
  assert.equal(buildExtendedRangeProducts([{...index,image_url:main}])[0]?.images.length??0,main.startsWith('https:')?1:0);
  assert.equal(reviewedColourOrderImage(plate.sku,main,'Green'),main);
 }
 const cached={...p,images:[p.image]};assert.equal(withReviewedPlateGallery(cached).images.length,17);assert.equal(cached.images.length,1);
 assert.equal(withReviewedPlateGallery({...p,images:p.images.slice(0,2)}).images.length,2);
});
test('two preferences remain separate basket lines, survive account save, and share the existing quantity policy',()=>{
 const p={...product(),unitsOfIssue:'10PC'};let basket=[];
 for(const option of [plate.options[0],plate.options.at(-1)])basket=addBasketLine(basket,{product:withReviewedColourPhoto(p,option.label),qty:800,preference:option.label},{quantityCapForProduct:instoreQuantityLimit}).items;
 assert.equal(basket.length,2);assert.equal(basket.reduce((n,line)=>n+line.qty,0),1243);assert.equal(new Set(basket.map(line=>line.product.sku)).size,1);
 const now=1800000000000,saved=cartPayload({items:parseCartMutation({mode:'save',revision:1,activityAt:now,items:basket},{now}).items,revision:2,activity_at:now});
 assert.deepEqual(saved.items.map(line=>line.preference),[plate.options[0].label,plate.options.at(-1).label]);assert.notEqual(saved.items[0].product.image,saved.items[1].product.image);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SARONGI_GALLERIES} from '../lib/sarongi-instore-gallery-data.mjs';
import {sarongiInstoreGallery} from '../lib/sarongi-instore-gallery.mjs';
import {buildExtendedRangeProducts} from '../api/extended-range.js';
import {addBasketLine} from '../lib/basket-lines.mjs';
import {instoreQuantityLimit} from '../lib/sarongi-instore-requests.mjs';

test('38 exact families have 120 decoded original-byte photo assets with no duplicated option identity',async()=>{
 assert.equal(Object.keys(SARONGI_GALLERIES).length,38);let count=0;
 for(const [sku,photos] of Object.entries(SARONGI_GALLERIES)){
  assert.ok(photos.length>=1&&photos.length<=8);assert.equal(new Set(photos.map(p=>p.label)).size,photos.length);
  for(const photo of photos){assert.ok(photo.path.startsWith('/product-options/sarongi/'+sku+'/'));const bytes=await readFile(new URL('../public'+photo.path,import.meta.url));const hash=createHash('sha256').update(bytes).digest('hex');assert.ok(photo.path.endsWith('/'+hash+'.jpg')||photo.path.endsWith('/'+hash+'.png'));count++;}
 }assert.equal(count,120);
});
test('any approved main is retained first without changing the gallery, SKU, title, price or shared balance',()=>{
 for(const [sku,photos] of Object.entries(SARONGI_GALLERIES))for(const main of photos){
  const image='https://www.proto.co.za'+main.path;
  const row={sku,title:'UNCHANGED DESCRIPTION',original_description:'UNCHANGED DESCRIPTION',price:10,available_stock:-7,image_url:image,image_source:'nutstore',is_active:true,image_review_status:'verified',visibility_status:'search_only'};
  const [product]=buildExtendedRangeProducts([row]);assert.equal(product.sku,sku);assert.equal(product.name,row.title);assert.equal(product.price,10);assert.equal(product.stockQty,-7);assert.equal(product.image,image);assert.equal(product.images[0],image);assert.equal(product.images.length,photos.length);
 }
});
test('a replaced, hidden, foreign, or unverified photo cannot resurrect a prepared gallery',()=>{
 const sku='KBRA4027',path=SARONGI_GALLERIES[sku][0].path;
 for(const url of ['https://www.proto.co.za/replacement.jpg','https://elsewhere.test'+path,'http://www.proto.co.za'+path,'https://www.proto.co.za'+path+'?changed=1',''])assert.deepEqual(sarongiInstoreGallery(sku,url),[]);
 assert.deepEqual(sarongiInstoreGallery('OTHER','https://www.proto.co.za'+path),[]);
 const [hidden]=buildExtendedRangeProducts([{sku,title:'UNCHANGED',price:10,available_stock:0,image_url:'https://www.proto.co.za'+path,image_control_status:'hidden',is_active:true,image_review_status:'verified',visibility_status:'search_only'}]);assert.equal(hidden.image,'');assert.deepEqual(hidden.images,[]);
});
test('the two reviewed KBRA4027 corrections follow original hashes, not the swapped filename suffixes',()=>{
 const photos=SARONGI_GALLERIES.KBRA4027;
 assert.equal(photos.find(p=>p.path.includes('7d1ba28718ec8ace')).label,'Turquoise beads / white starfish');
 assert.equal(photos.find(p=>p.path.includes('86094308c74f0739')).label,'White beads / turquoise starfish');
});
test('colour requests remain separate preference lines under one shared SKU and do not create stock variants',()=>{
 const product={id:'KBRA3014',sku:'KBRA3014',isExtendedRange:true,stockQty:9,price:27.5,unitsOfIssue:'4PC'};
 let basket=addBasketLine([],{product,qty:20,preference:'Purple'},{quantityCapForProduct:instoreQuantityLimit}).items;
 basket=addBasketLine(basket,{product,qty:20,preference:'Orange'},{quantityCapForProduct:instoreQuantityLimit}).items;
 assert.equal(basket.length,2);assert.equal(basket.reduce((n,line)=>n+line.qty,0),40);assert.ok(basket.every(line=>line.product.sku==='KBRA3014'&&line.product.stockQty===9&&line.product.unitsOfIssue==='4PC'));
});

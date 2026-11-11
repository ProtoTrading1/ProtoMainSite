import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachPrivateReviewGalleries} from '../lib/private-review-galleries.mjs';
const root='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/existing-review/';
test('preserves product data and displays all 17 images in order',()=>{const images=Array.from({length:17},(_,i)=>root+i),product={sku:'TEST',image:images[0],stockQty:9,price:12};assert.deepEqual(attachPrivateReviewGalleries([product],[{sku:'TEST',image_urls:images}]),[{...product,images}]);});
test('does not display hidden, stale, duplicate or invalid galleries',()=>{const urls=[root+'main',root+'two'],products=[{sku:'A',image:urls[0],imageStatus:'hidden'},{sku:'B',image:'old'},{sku:'C',image:urls[0]},{sku:'D',image:urls[0]}],rows=[{sku:'A',image_urls:urls},{sku:'B',image_urls:urls},{sku:'C',image_urls:[urls[0],'https://other.invalid/a']},{sku:'D',image_urls:[urls[0],urls[0]]}];assert.deepEqual(attachPrivateReviewGalleries(products,rows),products);});

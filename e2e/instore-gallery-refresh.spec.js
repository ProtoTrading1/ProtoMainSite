import {test,expect} from '@playwright/test';

test('an open one-photo cached product gains all three images when the catalogue refreshes',async({page,context})=>{
 let release;const ready=new Promise(resolve=>{release=resolve;});
 await context.route('**/api/extended-range*',async route=>{await ready;const p=await page.evaluate(()=>window.galleryFixture.product);await route.fulfill({json:{products:[p],catalogue:[p],tiles:[],total:1,page:1,pageSize:24}});});
 await context.route('**/api/stock*',route=>route.fulfill({json:{qty:20,sku:'SYNTHETIC-GALLERY',unitsOfIssue:'EACH',unitsOfIssueRaw:'EACH',unitsOfIssueVerified:true,unitsOfIssueSource:'positill_live',availability:{state:'in_stock',canOrder:true}}}));
 await page.goto('/e2e/fixtures/instore-cache-gallery.html');
 await page.locator('.product-image-button').click();
 await expect(page.locator('.pz-main-image-img')).toBeVisible();
 await expect(page.locator('.pz-gallery-thumb')).toHaveCount(0);
 release();
 await expect(page.locator('.pz-gallery-thumb')).toHaveCount(3);
 for(let n=1;n<=3;n++){
  await page.getByRole('button',{name:`View image ${n}`,exact:true}).click();
  await expect.poll(()=>page.locator('.pz-main-image-img').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
 }
 await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src',/26dacf3e/);
});

test('clearing the collection prevents an older pending refresh from restoring it',async({page,context})=>{
 let release;const ready=new Promise(resolve=>{release=resolve;});let complete;const completed=new Promise(resolve=>{complete=resolve;});let requests=0;
 await context.route('**/api/extended-range*',async route=>{const count=++requests,p=await page.evaluate(()=>window.galleryFixture.product);if(count===1)await ready;else p.images=p.images.slice(0,2);await route.fulfill({json:{products:[p],catalogue:[p],tiles:[],total:1,page:1,pageSize:24}});if(count===1)complete();});
 const request=page.waitForRequest(r=>r.url().includes('/api/extended-range?'));
 await page.goto('/e2e/fixtures/instore-cache-gallery.html');await request;
 await page.evaluate(()=>window.galleryFixture.clear());release();await completed;
 await expect.poll(()=>page.evaluate(()=>window.galleryFixture.snapshot())).toBe(null);
 await page.waitForTimeout(100);
 expect(await page.evaluate(()=>window.galleryFixture.snapshot())).toBe(null);
 expect(await page.evaluate(()=>window.galleryFixture.cached())).toBe(null);
 await page.evaluate(()=>window.galleryFixture.refresh());
 await expect.poll(()=>requests).toBe(2);
 await expect.poll(()=>page.evaluate(()=>window.galleryFixture.snapshot()?.[0]?.images.length)).toBe(2);
});

test('old idle work cannot start after clear or discard a newer pending refresh',async({page,context})=>{
 await page.addInitScript(()=>{window.fixtureIdle=[];window.requestIdleCallback=callback=>window.fixtureIdle.push(callback);});
 let requests=0;
 await context.route('**/api/extended-range*',async route=>{requests++;const p=await page.evaluate(()=>window.galleryFixture.product);await route.fulfill({json:{products:[p],catalogue:[p],tiles:[],total:1,page:1,pageSize:24}});});
 await page.goto('/e2e/fixtures/instore-cache-gallery.html');
 await expect.poll(()=>page.evaluate(()=>window.fixtureIdle.length)).toBe(1);
 await page.evaluate(()=>{window.galleryFixture.clear();void window.galleryFixture.refresh();});
 await expect.poll(()=>page.evaluate(()=>window.fixtureIdle.length)).toBe(2);
 expect(await page.evaluate(()=>window.galleryFixture.snapshot())).toBe(null);
 await page.evaluate(()=>window.fixtureIdle.shift()());
 await page.evaluate(()=>{void window.galleryFixture.refresh();});
 await expect.poll(()=>page.evaluate(()=>window.fixtureIdle.length)).toBe(1);
 expect(requests).toBe(0);
 await page.evaluate(()=>window.fixtureIdle.shift()());
 await expect.poll(()=>requests).toBe(1);
 await expect.poll(()=>page.evaluate(()=>window.galleryFixture.snapshot()?.[0]?.images.length)).toBe(3);
});

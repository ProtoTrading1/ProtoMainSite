import {test,expect} from '@playwright/test';
import products from './fixtures/legacy-low-stock.json' with {type:'json'};
import {buildImageCandidates} from '../src/lib/imageUrl.js';
test('existing low-stock cards preserve source identity, selected mains and verified EACH additions',async({page,context})=>{
 await context.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname==='127.0.0.1'?route.continue():route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>'});});
 await page.goto('/e2e/fixtures/legacy-low-stock.html');
 const cards=page.locator('.product-card');await expect(cards).toHaveCount(2);
 for(let i=0;i<products.length;i++){
  const card=cards.nth(i),product=products[i];await expect(card.getByRole('img',{name:product.name,exact:true})).toHaveAttribute('src',buildImageCandidates(product.image)[0]);
  await card.hover();const add=card.getByRole('button',{name:'Add to Cart',exact:true});await expect(add).toBeEnabled();await add.click();
 }
 await expect(page.getByRole('status').filter({hasText:'Preview additions:'})).toHaveText('Preview additions: 2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

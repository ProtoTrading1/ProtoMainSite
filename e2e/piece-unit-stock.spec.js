import {test,expect} from '@playwright/test';
import {fork} from 'node:child_process';
import process from 'node:process';
let child,origin;
// Playwright requires a destructured fixture argument even when unused.
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async({},worker)=>{
 const port=5418+worker.parallelIndex;origin=`http://127.0.0.1:${port}`;
 const env={PIECE_PREVIEW_PORT:String(port)};for(const key of ['PATH','SystemRoot','SYSTEMROOT','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
 child=fork(new URL('./fixtures/serve-piece-unit-preview.mjs',import.meta.url),[],{env,stdio:'pipe'});
 let stderr='';child.stderr.on('data',value=>{stderr+=value.toString();});
 const deadline=Date.now()+20000;while(Date.now()<deadline){if(child.exitCode!==null)throw Error('Isolated server failed: '+stderr);
  try{const value=await fetch(origin+'/__fixture/identity').then(r=>r.json());if(value.protocol==='proto.piece-unit-preview.v1')return;}catch{/* Wait for this isolated child only. */}
  await new Promise(resolve=>setTimeout(resolve,100));
 }throw Error('Isolated server identity was not ready');
});
test.afterAll(()=>{child?.kill();});
test('both5PCS aliases verify22 through actual stock handler;50PC mismatch stays unavailable',async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(origin+'/e2e/fixtures/piece-unit-stock.html');const cards=page.locator('.product-card');await expect(cards).toHaveCount(2);
 for(const card of await cards.all()){await expect(card).toContainText('22');await expect(card).toContainText('119');await expect(card).toContainText(/5pcs/i);await card.hover();await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();}
 await page.getByRole('button',{name:'Switch to mismatched50PC'}).click();
 for(const card of await cards.all()){await expect(card).toContainText('Stock unavailable');await card.hover();await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();}
 await expect(page.getByRole('status').filter({hasText:'Memory-only'})).toHaveText('Memory-only Add callbacks: 0');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

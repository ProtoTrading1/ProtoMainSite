import { test,expect } from '@playwright/test';
import { ACCOUNT_ID,catalogueProducts,installAccessibilityServices,signInCatalogue } from './helpers/accessibility-services.js';
import { selectPersonalisedArrivals } from '../api/_personalised-arrivals.js';

const arrival=page=>page.getByRole('region',{name:'New in the catalogue',exact:true});
const searchTip=page=>page.getByRole('region',{name:'Find more with Proto search',exact:true});
async function setup(page,context,{interests=['Stationery & educational products'],fail=false,highValue=false}={}){
  await installAccessibilityServices(context,{products:highValue?catalogueProducts.map(p=>({...p,price:1500})):catalogueProducts});
  const events=[];const requests=[];
  await context.route('**/api/shopping-events',async route=>{events.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
  await context.route('**/api/personalised-arrivals',async route=>{
    requests.push(route.request());
    if(fail)return route.fulfill({status:503,json:{error:'Suggestions unavailable'}});
    const item={...catalogueProducts[0],stock_on_hand:100,is_new:true,is_archived:false,category_path:['arts-crafts-stationery','books-pads'],created_at:new Date().toISOString()};
    const suggestions=selectPersonalisedArrivals({product_categories:interests},[item]);
    await route.fulfill({json:{suggestions,basis:'registration-interest'}});
  });
  // Authenticate and load lazy portal modules before controlling suggestion timers.
  await signInCatalogue(page);await page.clock.install();
  await page.clock.fastForward(6000);await expect(searchTip(page)).toBeVisible();
  expect(requests).toHaveLength(0);await expect(arrival(page)).toHaveCount(0);
  await page.clock.fastForward(13000);await expect(searchTip(page)).toHaveCount(0);
  return {events,requests};
}

test('arrival waits sixty unobstructed seconds, uses stated-interest match and opens the actual catalogue SKU',async({page,context})=>{
  const {events,requests}=await setup(page,context);
  await page.clock.fastForward(59000);await expect(arrival(page)).toHaveCount(0);
  await page.clock.fastForward(1500);await expect(arrival(page)).toBeVisible();
  await expect(arrival(page)).toContainText(catalogueProducts[0].name);
  await expect(arrival(page)).toContainText('Stationery & educational products');
  await arrival(page).getByRole('button',{name:'View product',exact:true}).click();
  await expect(page.locator('.pz-modal')).toBeVisible();await expect(page.locator('.pz-modal')).toContainText('NOTEBOOK | A5 | BLUE');
  await expect.poll(()=>events.filter(e=>e.eventType==='personalised_tip_clicked').length).toBe(1);
  expect(events.find(e=>e.eventType==='personalised_tip_clicked').productId).toBe('E2E-BLUE');
  expect(requests).toHaveLength(1);expect(requests[0].method()).toBe('GET');expect(requests[0].postData()).toBeNull();expect(new URL(requests[0].url()).search).toBe('');
  for(const e of events.filter(e=>e.eventType.startsWith('personalised_'))){expect(Object.keys(e).sort()).toEqual(['eventId','eventType','productId','sessionId','source','tipStage'].sort());expect(JSON.stringify(e)).not.toMatch(/example\.invalid|Synthetic Customer|product_categories|supply_needs/);}
});

test('unmapped registration interests do not produce a guessed suggestion',async({page,context})=>{
  const {requests}=await setup(page,context,{interests:['Other','Pet products']});
  await page.clock.fastForward(65000);await expect.poll(()=>requests.length).toBe(1);await expect(arrival(page)).toHaveCount(0);
});

test('dismissal gives seven-day cooldown across a new visit and one prompt maximum in a session',async({page,context})=>{
  const {events}=await setup(page,context);await page.clock.fastForward(65000);await expect(arrival(page)).toBeVisible();
  await arrival(page).getByRole('button',{name:/Dismiss/}).click();await expect(arrival(page)).toHaveCount(0);
  await expect.poll(()=>events.filter(e=>e.eventType==='personalised_tip_dismissed').length).toBe(1);
  await page.evaluate(id=>sessionStorage.removeItem(`proto_arrival_session_v1:${id}`),ACCOUNT_ID);
  await page.reload();await expect(page.locator('.product-card').first()).toBeVisible();await page.clock.fastForward(180000);await expect(arrival(page)).toHaveCount(0);
});

for(const blocker of ['basket','product'])test(`arrival never covers an open ${blocker}`,async({page,context})=>{
  await setup(page,context);
  if(blocker==='basket')await page.locator('[data-cart-trigger]').filter({visible:true}).click();
  else {await page.locator('.product-card').first().getByRole('button',{name:/^View /}).click();await expect(page.locator('.pz-modal')).toBeVisible();}
  await page.clock.fastForward(180000);await expect(arrival(page)).toHaveCount(0);
});

test('search guidance retains priority; failed suggestions stay silent without repeated requests',async({page,context})=>{
  const {requests}=await setup(page,context,{fail:true});
  await page.clock.fastForward(65000);await expect.poll(()=>requests.length).toBe(1);await expect(arrival(page)).toHaveCount(0);
  await page.clock.fastForward(90000);await expect(arrival(page)).toHaveCount(0);expect(requests).toHaveLength(1);
});

test('automatically fading suggestion does not repeat within the same session after reload',async({page,context})=>{
  const {events}=await setup(page,context);await page.clock.fastForward(65000);await expect(arrival(page)).toBeVisible();
  await page.clock.fastForward(13000);await expect(arrival(page)).toHaveCount(0);await page.reload();await expect(page.locator('.product-card').first()).toBeVisible();await page.clock.fastForward(180000);await expect(arrival(page)).toHaveCount(0);
  expect(events.filter(e=>e.eventType==='personalised_tip_shown')).toHaveLength(1);
});

test('arrival stays suppressed throughout checkout review without submitting an order',async({page,context})=>{
  const {requests}=await setup(page,context,{highValue:true});await page.locator('.product-card').first().getByRole('button',{name:'Add to Cart',exact:true}).click();
  if(test.info().project.name.includes('mobile'))await page.locator('[data-cart-trigger]').filter({visible:true}).click();
  await expect(page.getByRole('button',{name:'Review order request',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Review order request',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Review your order request'})).toBeVisible();
  await page.clock.fastForward(180000);await expect(arrival(page)).toHaveCount(0);expect(requests).toHaveLength(0);
});

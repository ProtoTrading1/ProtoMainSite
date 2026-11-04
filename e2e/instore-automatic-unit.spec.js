import {expect,test} from '@playwright/test';
import {catalogueProducts,installAccessibilityServices,signInCatalogue} from './helpers/accessibility-services.js';
const item=(sku,name)=>({id:sku,sku,code:sku,name,title:name,price:19.5,stockQty:32,stockOnHand:32,minQty:1,isExtendedRange:true,imageSource:'nutstore',image:'/bag_black.png',availability:{state:'in_stock',canOrder:true,label:'In stock'}});
const bracelet=item('KBRA3006','BRACELET 2 COWRIE W/BEADS');
const observation=(sku,qty=32)=>({sku,qty,unitsOfIssue:'EACH',unitsOfIssueRaw:'EACH',unitsOfIssueSource:'positill_live',unitsOfIssueVerified:true,availability:{state:qty>0?'in_stock':'out_of_stock',canOrder:qty>0,label:qty>0?'In stock':'Out of stock'}});
async function setup(context,products,read){
 await installAccessibilityServices(context,{products:catalogueProducts});
 await context.route('**/api/extended-range*',route=>route.fulfill({json:{products,catalogue:products,total:products.length,page:1,pageSize:24,tiles:[]}}));
 await context.route('**/api/stock*',async route=>{expect(route.request().headers().authorization).toMatch(/^Bearer /);await read(route,new URL(route.request().url()).searchParams.get('sku'));});
}
test('visible KBRA3006 automatically becomes orderable with exact Each unit and unchanged price',async({page,context},testInfo)=>{
 let checks=0;await setup(context,[bracelet],async(route,sku)=>{checks++;await route.fulfill({json:observation(sku)});});
 await signInCatalogue(page);await page.goto('/#/instore-products?q=KBRA3006');
 const card=page.locator('.instore-grid .product-card').first();
 await card.scrollIntoViewIfNeeded();
 await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();
 await expect(card.getByText('Minimum 1 · Each')).toBeVisible();await expect(card.getByText('R19.50',{exact:true})).toBeVisible();expect(checks).toBe(1);
 await page.screenshot({path:testInfo.outputPath('automatic-unit-confirmed.png')});
});
test('unknown units and wrong-SKU responses remain held; Retry gets a fresh result',async({page,context})=>{
 await setup(context,[bracelet],async route=>route.fulfill({json:{...observation('OTHER'),unitsOfIssueVerified:true}}));
 await signInCatalogue(page);await page.goto('/#/instore-products?q=KBRA3006');const card=page.locator('.instore-grid .product-card').first();await card.scrollIntoViewIfNeeded();
 await expect(card.getByText('Could not verify stock and selling unit',{exact:false})).toBeVisible();await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
 await context.route('**/api/stock*',route=>route.fulfill({json:observation(bracelet.sku)}));await card.getByRole('button',{name:'Retry',exact:true}).click();await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();
});
test('a zero-stock ordinary Instore product stays disabled after automatic unit verification',async({page,context})=>{
 const product=item('8610100223N','METAL E/RING CLIP ON');await setup(context,[product],async(route,sku)=>route.fulfill({json:observation(sku,0)}));await signInCatalogue(page);await page.goto('/#/instore-products?q=8610100223N');
 const card=page.locator('.instore-grid .product-card').first();await card.scrollIntoViewIfNeeded();await expect(card.getByText('Minimum 1 · Each')).toBeVisible();await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
});
test('automatic grid reads never exceed three simultaneous authenticated requests',async({page,context})=>{
 let active=0,peak=0;const products=Array.from({length:12},(_,i)=>item('AUTO-'+i,'Synthetic bracelet '+i));
 await setup(context,products,async(route,sku)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,120));await route.fulfill({json:observation(sku)});active--;});await signInCatalogue(page);await page.goto('/#/instore-products');
 await page.locator('.instore-grid .product-card').first().scrollIntoViewIfNeeded();await expect(page.locator('.instore-grid .product-card').first().getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();expect(peak).toBeGreaterThan(0);expect(peak).toBeLessThanOrEqual(3);
});

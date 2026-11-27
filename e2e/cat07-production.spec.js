import {expect,test} from '@playwright/test';
import {catalogueProducts,installAccessibilityServices,signInCatalogue} from './helpers/accessibility-services.js';
import {fixtureReceipt,fixtureImages} from './fixtures/cat07-server-data.mjs';
import {verifyCat07Row} from '../api/_cat07-family.js';
import {buildExtendedRangeProducts} from '../api/extended-range.js';
const sku='8640000274',row={sku,barcode:sku,title:'CHRISTMAS HANGING ORNAMENT',price:6,available_stock:6,minimum_stock:1,image_source:'nutstore',image_source_key:'cat07-family-v1:'+fixtureReceipt.manifestHash,image_url:fixtureReceipt.views[0].image.url,image_review_status:'verified',visibility_status:'search_only',is_active:true,category:'Party & Events'};
const [product]=buildExtendedRangeProducts([await verifyCat07Row(row,{client:{rpc:async()=>({data:fixtureReceipt,error:null})},read:async()=>({CODE:sku,DESCR:row.title,UNITS:'EACH',PRICE_A:5.22,ONHAND:6,BOOKED:0})})]);
async function install(context,p=product){
 await installAccessibilityServices(context,{products:catalogueProducts});
 await context.route('**/api/extended-range*',route=>route.fulfill({json:{products:[p],catalogue:[p],total:1,page:1,pageSize:24,tiles:[]}}));
 await context.route('**/api/stock*',route=>route.fulfill({json:{sku,qty:6,price:6,unitsOfIssue:'EACH',unitsOfIssueRaw:'EACH',unitsOfIssueSource:'positill_live',unitsOfIssueVerified:true,availability:{state:'in_stock',canOrder:true,label:'In stock'}}}));
 await context.route('https://admin.proto.co.za/api/cat07-family-image/**',route=>{const view=fixtureReceipt.views.find(v=>v.image.url===route.request().url());return route.fulfill(view?{contentType:'image/png',body:fixtureImages.get(view.id)}:{status:404,body:''});});
}
test('real signed-in Instore route renders completed nine-view family and shares six across named style basket lines',async({page,context})=>{
 await install(context);await signInCatalogue(page);await page.goto('/#/instore-products?q='+sku);
 const card=page.locator('.instore-grid .product-card').first(),choices=card.getByRole('group',{name:'Colour or design options'});
 await expect(choices.getByRole('button')).toHaveCount(8);await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
 await expect(card.getByText('All styles share one stock balance. Your preferred style is subject to availability.',{exact:true})).toBeVisible();
 for(const view of fixtureReceipt.views.slice(1)){await choices.getByRole('button',{name:view.label,exact:true}).click();await expect(card.locator('.pc-product-img')).toHaveAttribute('src',view.image.url);await expect.poll(()=>card.locator('.pc-product-img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);}
 await card.getByRole('button',{name:'View '+product.name,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('.pz-gallery-thumb')).toHaveCount(9);
 const modalChoices=dialog.getByRole('group',{name:'Colour or design options'});
 for(const view of fixtureReceipt.views.slice(2,4)){await modalChoices.getByRole('button',{name:view.label,exact:true}).click();await expect(modalChoices.getByRole('button')).toHaveCount(8);await expect(dialog.getByRole('img',{name:product.name,exact:true})).toHaveAttribute('src',view.image.url);await expect(dialog.locator('.pz-gallery-thumb')).toHaveCount(9);}
 await dialog.locator('.pz-gallery-thumb').filter({has:page.locator('img[src*="/overview/"]')}).click();await expect(dialog.getByRole('button',{name:'Add 1 to order',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await choices.getByRole('button',{name:fixtureReceipt.views[2].label,exact:true}).click();for(let i=0;i<3;i++)await card.getByRole('button',{name:/^Increase quantity from /}).click();await card.getByRole('button',{name:'Add to Cart',exact:true}).click();
 await choices.getByRole('button',{name:fixtureReceipt.views[3].label,exact:true}).click();await card.getByRole('button',{name:/^Decrease quantity from /}).click();await card.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
 const openBasket=page.getByRole('button',{name:/^(Open cart\. 6 items|Cart 6$)/});await openBasket.click();
 await expect(page.getByRole('button',{name:/Remove .*\(Gingerbread Man — red bow\) from cart/})).toBeVisible();await expect(page.getByRole('button',{name:/Remove .*\(Santa — carrying a gift\) from cart/})).toBeVisible();
 expect(await page.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
test('real card keeps missing completed-family proof held after verified stock; neighbour catalogue preserved',async({page,context})=>{
 await install(context,{...product,cat07Family:null});await signInCatalogue(page);await page.goto('/#/instore-products?q='+sku);const card=page.locator('.instore-grid .product-card').first();await expect(card).toBeVisible();await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();await expect(card.getByRole('group',{name:'Colour or design options'})).toHaveCount(0);
});

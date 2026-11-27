import {expect,test} from '@playwright/test';
import {catalogueProducts,installAccessibilityServices,signInCatalogue} from './helpers/accessibility-services.js';
import snapshot from './fixtures/party-plates.json' with {type:'json'};
import manifest from '../lib/reviewed-plate-gallery.json' with {type:'json'};
test('actual Instore card and modal require a named choice and preserve all17 photos',async({page,context})=>{
 await installAccessibilityServices(context,{products:catalogueProducts});
 const product={...snapshot,isExtendedRange:true};
 await context.route('**/api/extended-range*',route=>route.fulfill({json:{products:[product],catalogue:[product],total:1,page:1,pageSize:24,tiles:[]}}));
 await context.route('**/api/stock*',route=>route.fulfill({json:{sku:product.sku,qty:1243,unitsOfIssue:'10PC',unitsOfIssueRaw:'10PC',unitsOfIssueSource:'positill_live',unitsOfIssueVerified:true,availability:{state:'in_stock',canOrder:true,label:'In stock'}}}));
 await signInCatalogue(page);await page.goto('/#/instore-products?q='+product.sku);
 const card=page.locator('.instore-grid .product-card').first();
 await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
 const group=card.getByRole('group',{name:'Colour or design options',exact:true});await expect(group.getByRole('button')).toHaveCount(16);
 await expect(card.getByText('Stock available badges:',{exact:false})).toHaveCount(0);
 for(const option of manifest.options){await group.getByRole('button',{name:option.label,exact:true}).click();await expect(group.getByRole('button',{name:option.label,exact:true})).toHaveAttribute('aria-pressed','true');await expect(card.getByRole('img',{name:product.name,exact:true})).toHaveAttribute('src',new RegExp(option.originalSha256));}
 await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();
 await card.getByRole('button',{name:'View '+product.name,exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.locator('.pz-gallery-thumb')).toHaveCount(17);
 await dialog.locator('.pz-gallery-thumb').filter({has:page.locator('img[src*="'+manifest.overview.originalSha256+'"]')}).click();
 await expect(dialog.getByRole('button',{name:'Add 1 to order',exact:true})).toBeDisabled();
 await dialog.getByRole('group',{name:'Colour or design options'}).getByRole('button',{name:'White',exact:true}).click();
 await expect(dialog.getByRole('img',{name:product.name,exact:true})).toHaveAttribute('src',new RegExp(manifest.options.find(p=>p.label==='White').originalSha256));
 await expect(dialog.getByRole('button',{name:'Add 1 to order',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Add 1 to order',exact:true}).click();
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await group.getByRole('button',{name:'Lime Green',exact:true}).click();
 await card.getByRole('button',{name:'Add to Cart',exact:true}).click();
 const openBasket=page.getByRole('button',{name:/^(Open cart\. 2 items|Cart 2$)/});
 await expect(openBasket).toBeVisible();await openBasket.click();
 await expect(page.getByRole('button',{name:/Remove .*\(White\) from cart/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Remove .*\(Lime Green\) from cart/})).toBeVisible();
 const width=await page.locator('html').evaluate(el=>({document:el.scrollWidth,viewport:el.clientWidth}));expect(width.document).toBeLessThanOrEqual(width.viewport);
});



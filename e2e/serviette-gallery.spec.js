import {expect,test} from '@playwright/test';
import {catalogueProducts,installAccessibilityServices,signInCatalogue} from './helpers/accessibility-services.js';

test('shows all 17 designs on one product with the chosen main first',async({page,context})=>{
 const title='SYNTHETIC SERVIETTES',images=Array.from({length:17},(_,i)=>`/bag_black.png?design=${i+1}`);
 const product={...catalogueProducts[0],id:'TEST-SERVIETTE',sku:'TEST-SERVIETTE',code:'TEST-SERVIETTE',barcode:'TEST-SERVIETTE',name:title,title,image:images[0],images,price:15.5,stockQty:100,stockOnHand:100,isExtendedRange:true,availability:{state:'in_stock',canOrder:true,label:'In stock'}};
 await installAccessibilityServices(context);
 await context.route('**/api/extended-range*',route=>route.fulfill({json:{products:[product],catalogue:[product],total:1,page:1,pageSize:24,tiles:[]}}));
 await signInCatalogue(page);await page.goto('/#/instore-products?q=TEST-SERVIETTE');
 await page.getByRole('button',{name:`View ${title}`,exact:true}).click();
 await expect(page.locator('.pz-gallery-thumb')).toHaveCount(17);
 await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src',/design=1(?:&|$)/);
 await page.getByRole('button',{name:'View image 17',exact:true}).click();
 await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src',/design=17(?:&|$)/);
});

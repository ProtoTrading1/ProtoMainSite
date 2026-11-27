import {test,expect} from '@playwright/test';
import reviewed from '../../lib/cat07-reviewed-views.json' with {type:'json'};
test('actual card/detail preserve nine views and eight preferences; combined6 and order images/totals survive',async({page})=>{
 await page.goto('/e2e/fixtures/cat07.html');const card=page.locator('.product-card'),options=card.getByRole('group',{name:'Colour or design options'});
 await expect(options.getByRole('button')).toHaveCount(8);await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
 await expect(page.getByRole('link',{name:'Open Owner Archive and search 8640000274'})).toHaveAttribute('href','https://admin.proto.co.za/?section=archive');
 for(const style of reviewed.styles){await options.getByRole('button',{name:style.label,exact:true}).click();await expect(card.locator('.pc-product-img')).toHaveAttribute('src',new RegExp('/style-'+style.attachment+'/'));await expect.poll(()=>card.locator('.pc-product-img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();}
 await card.getByRole('button',{name:'View CHRISTMAS HANGING ORNAMENT',exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.locator('.pz-gallery-thumb')).toHaveCount(9);
 await modal.locator('.pz-gallery-thumb').filter({has:page.locator('img[src*="/overview/"]')}).click();await expect(modal.getByRole('button',{name:'Add 1 to order',exact:true})).toBeDisabled();await modal.getByRole('button',{name:'Close',exact:true}).click();
 await options.getByRole('button',{name:reviewed.styles[1].label,exact:true}).click();
 const plus=card.getByRole('button',{name:/^Increase quantity from /});for(let i=0;i<3;i++)await plus.click();await card.getByRole('button',{name:'Add to Cart',exact:true}).click();
 await options.getByRole('button',{name:reviewed.styles[2].label,exact:true}).click();await card.getByRole('button',{name:/^Decrease quantity from /}).click();await card.getByRole('button',{name:'Add to Cart',exact:true}).click();
 await expect(page.getByText('Added 2 of the 3 requested ornaments. All styles share six ornaments.',{exact:true})).toBeVisible();await expect(page.getByTestId('shared-total')).toHaveText('6 of 6 ornaments');await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Preview order',exact:true}).click();const frame=page.frameLocator('iframe[title="Order preview"]');await expect(frame.getByText('8640000274',{exact:true})).toHaveCount(2);await expect(frame.getByText('R36.00',{exact:true})).toHaveCount(2);await expect(frame.getByText('R24.00',{exact:true})).toBeVisible();await expect(frame.getByText('R12.00',{exact:true})).toBeVisible();
 await expect.poll(()=>frame.locator('img[src*="/style-"]').evaluateAll(imgs=>imgs.length===2&&imgs.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('pending family cannot fall through to ordinary Add and unexpected network/methods are denied',async({page,request})=>{
 const product=await (await request.get('/__fixture/cat07/product')).json();
 await page.route('**/__fixture/cat07/product',route=>route.fulfill({json:{...product,cat07Family:{...product.cat07Family,state:'pending'}}}));
 await page.goto('/e2e/fixtures/cat07.html');await expect(page.locator('.product-card')).toBeVisible();await expect(page.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
 for(const path of ['/api/send-order','/mock-supabase/auth/v1/token'])expect((await request.post(path,{data:{}})).status()).toBe(409);
 expect((await request.post('/__fixture/cat07/product')).status()).toBe(404);
 expect((await request.get('/__fixture/cat07/product',{headers:{Host:'evil.invalid'}})).status()).toBe(403);
 expect((await request.post('/__fixture/cat07/order-preview',{headers:{Origin:'https://evil.invalid'},data:{items:[]}})).status()).toBe(403);
});

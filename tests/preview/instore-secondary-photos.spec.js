import {test,expect} from '@playwright/test';
test('secondary photos use ordinary carousel, preserve main/identity/order data and disappear on fresh base-only response',async({page})=>{
 // Service worker serves exact reviewed photos locally; all other external requests are aborted.
 await page.route('https://**/*',route=>route.abort('blockedbyclient'));
 await page.goto('/e2e/fixtures/instore-secondary-photos.html');await expect(page.getByTestId('fixture-status')).toHaveText('Main photos only');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.product-image-button')).toHaveCount(2);await page.getByRole('button',{name:'Show secondary photos',exact:true}).click();await expect(page.getByTestId('fixture-status')).toHaveText('Secondary preview attached');
 await page.locator('.product-image-button').first().click();await expect(page.locator('.pz-gallery-thumb')).toHaveCount(2);
 await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src',/932c0a72/);
 await page.getByRole('button',{name:'View image 2',exact:true}).click();await expect.poll(()=>page.locator('.pz-main-image-img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src',/instore-secondary-v1/);
 await expect(page.locator('.pc-colour-options')).toHaveCount(0);
 const close=page.getByRole('button',{name:/Close.*preview|Close.*detail|Close/i}).last();await close.click();
 await page.getByRole('button',{name:'Return to main photos',exact:true}).click();await expect(page.getByTestId('fixture-status')).toHaveText('Main photos only');await page.locator('.product-image-button').first().click();
 await expect(page.locator('.pz-gallery-thumb')).toHaveCount(0);await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src',/932c0a72/);
 expect(await page.locator('[data-testid="preview-basket"]').textContent()).toBe('[]');await expect.poll(()=>page.locator('.pz-main-image-img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
});

test('a delayed main-only selection cannot replace a later secondary-photo selection',async({page})=>{
 await page.route('https://**/*',route=>route.abort('blockedbyclient'));
 await page.goto('/e2e/fixtures/instore-secondary-photos.html');await expect(page.getByTestId('fixture-status')).toHaveText('Main photos only');
 let release;const held=new Promise(resolve=>{release=resolve;});
 await page.route('**/__fixture/secondary/catalogue?photos=no',async route=>{await held;await route.continue();});
 const started=page.waitForRequest(request=>request.url().endsWith('/__fixture/secondary/catalogue?photos=no'));
 await page.evaluate(()=>{window.lateSecondarySelection=window.secondaryPhotoPreview.load('no');});await started;
 await page.getByRole('button',{name:'Show secondary photos',exact:true}).click();await expect(page.getByTestId('fixture-status')).toHaveText('Secondary preview attached');
 release();await page.evaluate(()=>window.lateSecondarySelection);
 await expect(page.getByTestId('fixture-status')).toHaveText('Secondary preview attached');
 await page.locator('.product-image-button').first().click();await expect(page.locator('.pz-gallery-thumb')).toHaveCount(2);
});

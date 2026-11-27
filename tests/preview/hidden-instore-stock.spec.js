import {test,expect} from '@playwright/test';
test('a mounted cached verified card loses Add after the hidden fresh-check and retained checkout is denied',async({page})=>{
 await page.goto('/e2e/fixtures/hidden-instore-stock.html');await page.evaluate(()=>fetch('/__fixture/hidden-stock/reset',{method:'POST'}));await page.reload();const add=page.getByRole('button',{name:'Add to Cart',exact:true});
 await add.scrollIntoViewIfNeeded();await expect(add).toBeEnabled();await page.getByRole('button',{name:'Hide synthetic listing',exact:true}).click();
 await page.getByRole('button',{name:'View TUMBLER CAN W/BAMBOO LID STRAW 500ml',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('Could not verify stock and selling unit',{exact:false})).toBeVisible();await expect(dialog.getByRole('button',{name:'Add 1 to order',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(add).toBeDisabled();
 await page.getByRole('button',{name:'Check retained basket order',exact:true}).click();await expect(page.getByText(/Retained basket order held:/)).toBeVisible();await expect(page.getByTestId('adds')).toHaveText('0');
});

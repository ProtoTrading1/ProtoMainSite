import { test, expect } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue, TEST_EMAIL, TEST_PASSWORD } from './helpers/accessibility-services.js';

test('late SDK INITIAL_SESSION null preserves a new login; sign-out remains authoritative', async ({page,context}) => {
  await installAccessibilityServices(context);
  await context.route('**/mock-supabase/auth/v1/logout**', route => route.fulfill({status:204}));
  await signInCatalogue(page);
  await page.evaluate(async () => {
    const {supabase}=await import('/src/lib/supabase.js');
    // Deliver the stale snapshot through the actual SDK subscriber path after
    // sign-in. The real SDK storage/lock races are reproduced by unit probes.
    await supabase.auth._notifyAllSubscribers('INITIAL_SESSION',null);
  });
  await expect(page.locator('.product-card').first()).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('sb-')&&key.endsWith('-auth-token')&&Boolean(JSON.parse(localStorage.getItem(key))?.access_token)))).toBe(true);
  await page.evaluate(async()=>{const {supabase}=await import('/src/lib/supabase.js');await supabase.auth.signOut({scope:'local'});});
  await expect(page.locator('.product-card')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/sign in/i}).first()).toBeVisible();
});

test('late profile completion is consumed without changing the signed-out surface', async ({page,context}) => {
  await installAccessibilityServices(context);
  await context.addInitScript(()=>{
    const json=Response.prototype.json;
    Response.prototype.json=async function(...args){
      const value=await json.apply(this,args);
      if(this.url && new URL(this.url).pathname==='/api/customer-profile' && value?.profile)window.__syntheticProfileConsumed=true;
      return value;
    };
  });
  await context.route('**/mock-supabase/auth/v1/logout**', route => route.fulfill({status:204}));
  let entered=false,release;
  const gate=new Promise(resolve=>{release=resolve;});
  await context.route('**/api/customer-profile?**', async route=>{
    entered=true;await gate;await route.fallback();
  });
  await page.goto('/');
  await page.getByRole('button',{name:/sign in/i}).first().click();
  const dialog=page.getByRole('dialog',{name:'Welcome back.'});
  await dialog.getByPlaceholder('name@business.co.za').fill(TEST_EMAIL);
  await dialog.locator('input[type="password"]').fill(TEST_PASSWORD);
  await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect.poll(()=>entered).toBe(true);
  await page.evaluate(async()=>{
    const {supabase}=await import('/src/lib/supabase.js');
    await supabase.auth.signOut({scope:'local'});
  });
  const completed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/customer-profile');
  release();
  await completed;
  await expect.poll(()=>page.evaluate(()=>Boolean(window.__syntheticProfileConsumed))).toBe(true);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByRole('button',{name:/sign in/i}).first()).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
  expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('sb-')&&key.endsWith('-auth-token')))).toBe(false);
});

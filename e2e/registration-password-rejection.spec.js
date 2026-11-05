import { expect, test } from '@playwright/test';
import { createRegisterTradeHandler } from '../api/register-trade.js';

test('rejected password stays on form, preserves details, and corrected registration reaches confirmation',async({page},testInfo)=>{
  let creates=0,profiles=0,mails=0;
  const previous=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='synthetic-inert';
  const id='00000000-0000-4000-8000-000000000007';
  const client={auth:{admin:{async createUser({password}){creates++;return password==='1234567890'?{error:{code:'weak_password'}}:{data:{user:{id}}};}}},from(){return {
    select(){return this;},eq(){return this;},async limit(){return {data:[],error:null};},async upsert(){profiles++;return {};},async single(){return {data:{id}};},
  };}};
  const handler=createRegisterTradeHandler({createServiceClient:()=>client,rateLimit:async()=>({allowed:true}),sendAdmin:async()=>{},sendVerification:async()=>{mails++;return {sent:true};},wait:async()=>{}});
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,validationOnly:true})}));
  await page.route('**/api/register-trade',async route=>{
    const res={statusCode:200,status(n){this.statusCode=n;return this;},setHeader(){},json(body){this.body=body;return this;}};
    await handler({method:'POST',headers:{},body:route.request().postDataJSON()},res);
    await route.fulfill({status:res.statusCode,contentType:'application/json',body:JSON.stringify(res.body)});
  });
  try {
    await page.goto('/');
    await page.locator('#trade-company-name').fill('Synthetic Trade');
    await page.locator('#trade-contact-name').fill('Synthetic Applicant');
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.locator('#trade-phone').fill('0825550123');
    await page.getByRole('button',{name:'No WhatsApp updates',exact:true}).click();
    await page.locator('#trade-new-password').fill('1234567890');
    await page.locator('#trade-email').fill('synthetic@fixture.invalid');
    await page.locator('#trade-email').press('Enter');
    await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
    for(const [id,value] of [['trade-billing-street','1 Fixture Road'],['trade-billing-suburb','Fixture Suburb'],['trade-billing-city','Fixture City'],['trade-billing-postal-code','0001']])await page.locator(`#${id}`).fill(value);
    await page.getByLabel(/Use billing address for delivery/).check();
    await page.getByRole('button',{name:'House',exact:true}).click();
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByRole('button',{name:'Physical retail store',exact:true}).click();
    await page.getByRole('button',{name:'Art, craft & beads',exact:true}).click();
    await page.getByPlaceholder(/Gifts and party supplies sold/).fill('Synthetic gifts supplied to local shops.');
    await page.getByRole('button',{name:'Submit application',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Add the account and contact details.'})).toBeVisible();
    await expect(page.getByRole('region',{name:'Check your email'})).toHaveCount(0);
    await expect(page.locator('#trade-new-password')).toHaveValue('');
    await expect(page.locator('#trade-new-password')).toHaveAttribute('aria-invalid','true');
    await expect(page.locator('.lp-register-field-error').filter({hasText:'This password is too weak or has appeared in a data breach.'})).toBeVisible();
    await expect(page.locator('#trade-email')).toHaveValue('synthetic@fixture.invalid');
    await expect(page.locator('#trade-phone')).toHaveValue('0825550123');
    expect([creates,profiles,mails]).toEqual([1,0,0]);
    await page.screenshot({path:testInfo.outputPath('rejected-password.png'),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator('#trade-new-password').fill('A stronger synthetic password!');
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await expect(page.locator('#trade-billing-street')).toHaveValue('1 Fixture Road');
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await expect(page.getByPlaceholder(/Gifts and party supplies sold/)).toHaveValue('Synthetic gifts supplied to local shops.');
    await page.getByRole('button',{name:'Submit application',exact:true}).click();
    await expect(page.getByRole('region',{name:'Check your email'})).toBeVisible();
    expect([creates,profiles,mails]).toEqual([2,1,1]);
    await page.screenshot({path:testInfo.outputPath('successful-registration.png'),fullPage:true});
  }finally{if(previous===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=previous;}
});

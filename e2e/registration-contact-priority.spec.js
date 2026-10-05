import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(new URL(route.request().url()).pathname==='/api/check-registration-email'?{ok:true,validationOnly:true}:{ok:true,receipt:'CHECK_EMAIL_OR_SIGN_IN',instantAccess:false,emailVerificationRequired:true}) }));
});

async function contact(page) {
  await page.goto('/');
  await page.locator('#trade-company-name').fill('Synthetic Trade');
  await page.locator('#trade-contact-name').fill('Synthetic Applicant');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Add the account and contact details.'})).toBeVisible();
}
async function fields(page,{phone='0825550123',consent=false,password='1234567890'}={}) {
  await page.locator('#trade-phone').fill(phone);
  await page.getByRole('button',{name:consent?'Yes, send updates':'No WhatsApp updates',exact:true}).click();
  await page.locator('#trade-new-password').fill(password);
  await page.locator('#trade-email').fill('synthetic@fixture.invalid');
}
async function capture(page,testInfo,name) {
  await page.waitForFunction(() => [...document.querySelectorAll('.lp-quiz-step')].every(el => Number(getComputedStyle(el.parentElement).opacity) > 0.99));
  await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:false});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

test('a valid email check is silent and has no account-recovery buttons beside the field',async({page},testInfo)=>{
  await contact(page);await fields(page);
  const checked=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/check-registration-email');
  await page.locator('#trade-email').press('Tab');await checked;
  const emailField=page.locator('.lp-quiz-field').filter({has:page.locator('#trade-email')});
  await expect(emailField.locator('.lp-register-email-status')).toHaveCount(0);
  await expect(page.getByText(/Email format checked/)).toHaveCount(0);
  await expect(emailField.getByRole('button',{name:/Sign in|Reset password/})).toHaveCount(0);
  await capture(page,testInfo,'contact-email-quiet');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
});

test('an email-check failure keeps inline retry guidance and becomes silent after retry',async({page},testInfo)=>{
  let requests=0;
  await page.route('**/api/check-registration-email',route=>{
    requests++;
    return route.fulfill({status:requests===1?503:200,contentType:'application/json',body:JSON.stringify(requests===1?{error:'Synthetic unavailable'}:{ok:true,validationOnly:true})});
  });
  await contact(page);await fields(page);
  await page.locator('#trade-email').press('Tab');
  const emailField=page.locator('.lp-quiz-field').filter({has:page.locator('#trade-email')});
  await expect(emailField.locator('.lp-register-email-status')).toContainText('temporarily unavailable');
  await expect(emailField.getByRole('button',{name:/Sign in|Reset password/})).toHaveCount(0);
  await capture(page,testInfo,'contact-email-check-error');
  await emailField.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(emailField.locator('.lp-register-email-status')).toHaveCount(0);
  expect(requests).toBe(2);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
});

test('native autofill input events update Contact state before continuing',async({page},testInfo)=>{
  await contact(page);
  await page.evaluate(()=>{
    for(const [id,value] of [['trade-phone','+27825550123'],['trade-new-password','1234567890'],['trade-email','synthetic@fixture.invalid']]) {
      const input=document.getElementById(id);input.value=value;
      input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText'}));
    }
  });
  await page.getByRole('button',{name:'No WhatsApp updates',exact:true}).click();
  await capture(page,testInfo,'contact-autofill');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
});

test('neutral application receipt offers recovery without asserting account creation or mail delivery',async({page},testInfo)=>{
  let applications=0;
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/register-trade')applications++;});
  await contact(page);await fields(page);
  await page.locator('#trade-email').press('Enter');
  await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
  for(const [id,value] of [['trade-billing-street','1 Fixture Road'],['trade-billing-suburb','Fixture Suburb'],['trade-billing-city','Fixture City'],['trade-billing-postal-code','0001']]) await page.locator(`#${id}`).fill(value);
  await page.getByLabel(/Use billing address for delivery/).check();
  await page.getByRole('button',{name:'House',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Physical retail store',exact:true}).click();
  await page.getByRole('button',{name:'Art, craft & beads',exact:true}).click();
  await page.getByPlaceholder(/Gifts and party supplies sold/).fill('Synthetic gifts supplied to local shops.');
  await page.getByRole('button',{name:'Submit application',exact:true}).click();
  const receipt=page.getByRole('region',{name:'Check your email or sign in'});
  await expect(receipt).toBeVisible();await expect(receipt).toBeFocused();
  await expect(receipt).toContainText('If this is a new application');
  await expect(receipt).not.toContainText('account has been created');
  await expect(receipt.getByRole('button',{name:'Reset password',exact:true})).toBeVisible();
  await capture(page,testInfo,'neutral-receipt');expect(applications).toBe(1);
  await page.reload();await expect(page.locator('#trade-company-name')).toBeVisible();expect(applications).toBe(1);
});

for(const phone of ['0825550123','+27825550123']) for(const consent of [true,false]) {
  test(`contact advances with ten-character password, ${phone.startsWith('+')?'international':'local'} phone and ${consent?'Yes':'No'}`,async({page},testInfo)=>{
    await contact(page);await fields(page,{phone,consent});
    await expect(page.locator('#trade-new-password')).toHaveAttribute('minlength','10');
    await expect(page.locator('label[for="trade-new-password"]')).toContainText('10 characters');
    await capture(page,testInfo,'contact-valid');
    await page.locator('#trade-email').press('Enter');
    await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
  });
}

test('Contact names the missing WhatsApp choice instead of blaming a valid password or phone',async({page},testInfo)=>{
  await contact(page);
  await page.locator('#trade-email').fill('synthetic@fixture.invalid');
  await page.locator('#trade-phone').fill('+27825550123');
  await page.locator('#trade-new-password').fill('1234567890');
  await page.locator('#trade-email').press('Enter');
  const summary=page.getByRole('alert');
  await expect(summary).toBeFocused();await expect(summary).toContainText('Choose Yes or No for WhatsApp updates.');
  await expect(summary).not.toContainText('phone number');await expect(summary).not.toContainText('password');
  await capture(page,testInfo,'contact-choice-error');
  await page.getByRole('button',{name:'No WhatsApp updates',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
});

test('eight and nine character new passwords name the ten-character requirement',async({page},testInfo)=>{
  await contact(page);await fields(page,{password:'12345678'});
  await page.locator('#trade-email').press('Enter');
  await expect(page.getByRole('alert')).toContainText('Password must be at least 10 characters.');
  await page.locator('#trade-new-password').fill('123456789');
  await page.locator('#trade-email').press('Enter');
  await expect(page.getByRole('alert')).toContainText('Password must be at least 10 characters.');
  await capture(page,testInfo,'contact-password-error');
  await page.locator('#trade-new-password').fill('1234567890');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Billing and delivery addresses'})).toBeVisible();
});

for(const field of ['phone','password','back','email']) {
  test(`pending Contact email check uses current ${field} state`,async({page},testInfo)=>{
    await contact(page);await fields(page);
    let release,entered;let requests=0;
    const gate=new Promise(resolve=>{release=resolve;});
    const started=new Promise(resolve=>{entered=resolve;});
    await page.route('**/api/check-registration-email',async route=>{requests++;entered();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,validationOnly:true})});});
    await page.locator('#trade-email').press('Enter');await started;
    if(field==='back') await page.getByRole('button',{name:/Back$/}).click();
    else await page.locator(field==='phone'?'#trade-phone':field==='password'?'#trade-new-password':'#trade-email').fill(field==='email'?'new@fixture.invalid':'');
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/check-registration-email');
    release();await response;
    await expect(page.getByRole('button',{name:'Next',exact:true})).toBeEnabled();
    expect(requests).toBe(1);
    if(field==='back') {
      await expect(page.getByRole('heading',{name:'Start with the core company details.'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Next',exact:true})).toBeEnabled();
    }else if(field==='email') {
      await expect(page.getByRole('heading',{name:'Add the account and contact details.'})).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }else {
      await expect(page.getByRole('alert')).toContainText(field==='phone'?'Enter your phone number.':'Create a password of at least 10 characters.');
      await expect(page.getByRole('heading',{name:'Add the account and contact details.'})).toBeVisible();
    }
    await capture(page,testInfo,`contact-late-${field}`);
  });
}

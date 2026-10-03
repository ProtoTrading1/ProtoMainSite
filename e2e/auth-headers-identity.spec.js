import { test, expect } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test.beforeEach(async ({ page, context }) => {
  await installAccessibilityServices(context);
  await signInCatalogue(page);
});

test('explicit old-session headers cannot replace the current account token', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const auth = await import('/src/lib/authHeaders.js');
    auth.rememberAuthSession({ user: { id: 'synthetic-B' }, access_token: 'synthetic-token-B' });
    const old = await auth.authHeaders({ user: { id: 'synthetic-A' }, access_token: 'synthetic-token-A' });
    const current = await auth.authHeaders();
    return [old.Authorization, current.Authorization];
  });
  expect(result).toEqual(['Bearer synthetic-token-A', 'Bearer synthetic-token-B']);
});

for (const scenario of ['account change', 'logout', 'same-user refresh']) {
  test(`delayed authentication recovery handles ${scenario} without mixing accounts`, async ({ page }) => {
    const result = await page.evaluate(async scenario => {
      const auth = await import('/src/lib/authHeaders.js');
      const { supabase } = await import('/src/lib/supabase.js');
      const original = supabase.auth.refreshSession;
      const a = { user: { id: 'synthetic-A' }, access_token: 'synthetic-token-A' };
      const next = scenario === 'logout' ? null : {
        user: { id: scenario === 'account change' ? 'synthetic-B' : 'synthetic-A' },
        access_token: 'synthetic-next-token',
      };
      let release, entered;
      const started = new Promise(resolve => { entered = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      supabase.auth.refreshSession = async () => { entered(); await gate; return { data: { session: next || a }, error: null }; };
      try {
        auth.rememberAuthSession(a);
        const pending = auth.refreshAuthHeaders().then(headers => ({ token: headers.Authorization }), error => ({ code: error.code, error: error.message }));
        await started;
        auth.rememberAuthSession(next);
        release();
        return await pending;
      } finally {
        supabase.auth.refreshSession = original;
      }
    }, scenario);
    if (scenario === 'same-user refresh') expect(result).toEqual({ token: 'Bearer synthetic-next-token' });
    else expect(result.code).toBe('AUTH_ACCOUNT_CHANGED');
  });
}

for (const {method,scenario} of [
  {method:'GET',scenario:'account change'},
  {method:'PUT',scenario:'account change'},
  {method:'DELETE',scenario:'A-to-B-to-A'},
  {method:'GET',scenario:'same-user refresh'},
]) {
  test(`${method} late 401 ${scenario} preserves request ownership`, async ({page}) => {
    const result=await page.evaluate(async ({method,scenario})=>{
      const auth=await import('/src/lib/authHeaders.js');
      const cart=await import('/src/lib/accountCart.js');
      const {supabase}=await import('/src/lib/supabase.js');
      const originalFetch=window.fetch, originalRefresh=supabase.auth.refreshSession;
      const a={user:{id:'synthetic-A'},access_token:'synthetic-A'};
      const b={user:{id:'synthetic-B'},access_token:'synthetic-B'};
      const latest={user:{id:'synthetic-A'},access_token:'synthetic-A-latest'};
      let entered,release,refreshes=0;
      const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
      const sent=[];
      window.fetch=async (input,init)=>{
        if(String(input)!=='/api/account-cart')return originalFetch(input,init);
        sent.push({method:init.method,token:init.headers.Authorization});
        if(sent.length===1){entered();await gate;return new Response('{}',{status:401});}
        return new Response(JSON.stringify({items:[],revision:2}));
      };
      supabase.auth.refreshSession=async()=>{refreshes++;return {data:{session:latest},error:null};};
      try {
        auth.rememberAuthSession(a);
        const operation=method==='GET'?cart.getAccountCart():method==='PUT'?cart.saveAccountCart([],1,1):cart.clearAccountCart(1,1);
        const pending=operation.then(()=>({ok:true}),error=>({code:error.code}));
        await started;
        if(scenario==='account change')auth.rememberAuthSession(b);
        else if(scenario==='A-to-B-to-A'){auth.rememberAuthSession(b);auth.rememberAuthSession(latest);}
        else auth.rememberAuthSession(latest);
        release();const outcome=await pending;
        const current=await auth.authHeaders();
        return {outcome,sent,refreshes,current:current.Authorization};
      } finally {window.fetch=originalFetch;supabase.auth.refreshSession=originalRefresh;}
    },{method,scenario});
    if(scenario==='same-user refresh'){
      expect(result.outcome).toEqual({ok:true});
      expect(result.sent).toEqual([{method,token:'Bearer synthetic-A'},{method,token:'Bearer synthetic-A-latest'}]);
      expect(result.refreshes).toBe(1);
    } else {
      expect(result.outcome).toEqual({code:'AUTH_ACCOUNT_CHANGED'});
      expect(result.sent).toEqual([{method,token:'Bearer synthetic-A'}]);
      expect(result.refreshes).toBe(0);
    }
    expect(result.current).toBe(scenario==='account change'?'Bearer synthetic-B':'Bearer synthetic-A-latest');
  });
}

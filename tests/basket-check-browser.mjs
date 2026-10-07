import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const REF = '00000000-0000-4000-8000-000000000003';
const KEY = 'sb-abcdefghijklmnopqrst-auth-token';
const journalKey = `proto_pending_checkout_v1:${A}`;
const saved = JSON.stringify({ version: 1, customerId: A, payload: { clientRef: REF, items: [{ secret: 'PRIVATE' }] }, items: [{}], total: 10, fingerprint: 'PRIVATE', options: {} });
const session = JSON.stringify({ access_token: 'abc.def.ghi', expires_at: 9999999999, user: { id: A } });
for (const width of [390, 1280]) {
  for (const scenario of ['copy', 'changed', 'expired', 'malicious']) {
    test(`built standalone helper ${scenario} at ${width}px`, async () => {
      const network = [], errors = [];
      const server = createServer(async (req, res) => {
        if (!['/basket-check.html', '/basket-check.css', '/basket-check.js'].includes(req.url)) { res.writeHead(404); res.end(); return; }
        try {
          const body = await readFile(new URL(`../dist${req.url}`, import.meta.url));
          res.setHeader('Content-Type', req.url.endsWith('.html') ? 'text/html' : req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
          res.end(body);
        } catch { res.writeHead(500); res.end(); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      let browser;
      try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width, height: 860 } });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(({ KEY, journalKey, saved, session, scenario }) => {
          localStorage.setItem(KEY, scenario === 'expired' ? session.replace('9999999999', '1') : session);
          localStorage.setItem(journalKey, scenario === 'malicious' ? saved.replace('00000000-0000-4000-8000-000000000003', '<img src=x onerror=alert(1)>') : saved);
          localStorage.setItem('proto_cart_pending_private', 'KEEP PRIVATE BASKET');
          window.helperCopies = [];
          Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => window.helperCopies.push(value) } });
        }, { KEY, journalKey, saved, session, scenario });
        await page.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          network.push({ method: req.method(), path: url.pathname, host: url.hostname });
          if (url.hostname !== '127.0.0.1') { await route.abort(); return; }
          if (url.pathname === '/api/basket-check-session') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 1, sessionStorageKey: KEY, ...(url.searchParams.get('mode') === 'identity' ? { customerId: A } : {}) }) }); return;
          }
          await route.continue();
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/basket-check.html`);
        const before = await page.evaluate(() => JSON.stringify({ ...localStorage }));
        assert.equal(await page.locator('#root').count(), 0);
        assert.equal(network.filter(r => r.path.startsWith('/api/')).length, 0);
        await page.locator('#check-button').click();
        if (['expired', 'malicious'].includes(scenario)) {
          await page.waitForFunction(() => !document.querySelector('#check-button').disabled);
          assert.equal(await page.locator('#report').isVisible(), false);
          assert.equal(await page.locator('#consent').isDisabled(), true);
        } else {
          await page.locator('#report').waitFor({ state: 'visible' });
          const report = JSON.parse(await page.locator('#report').textContent());
          assert.deepEqual(report, { hostname: '127.0.0.1', clientRef: REF, version: 1, lineCount: 1, hasResult: false });
          assert.equal(await page.locator('#copy-button').isDisabled(), true);
          if (scenario === 'changed') {
            await page.evaluate(({ KEY, B }) => localStorage.setItem(KEY, JSON.stringify({ access_token: 'abc.def.ghi', expires_at: 9999999999, user: { id: B } })), { KEY, B });
            await page.locator('#report').waitFor({ state: 'hidden' });
            assert.equal(await page.locator('#copy-button').isDisabled(), true);
          } else {
            await page.locator('#consent').check();
            await page.locator('#copy-button').click();
            await page.waitForFunction(() => window.helperCopies.length === 1);
            const copies = await page.evaluate(() => window.helperCopies);
            assert.doesNotMatch(copies[0], /PRIVATE|abc.def.ghi|customerId|secret/);
          }
        }
        const after = await page.evaluate(() => JSON.stringify({ ...localStorage }));
        if (scenario !== 'changed') assert.equal(after, before);
        else assert.equal(await page.evaluate(key => localStorage.getItem(key), journalKey), saved);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        assert.ok(network.every(r => r.method === 'GET' && r.host === '127.0.0.1'));
        assert.ok(network.every(r => ['/basket-check.html', '/basket-check.css', '/basket-check.js', '/api/basket-check-session', '/favicon.ico'].includes(r.path)));
        if (scenario !== 'copy') assert.deepEqual(await page.evaluate(() => window.helperCopies), []);
      } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
      }
    });
  }
}

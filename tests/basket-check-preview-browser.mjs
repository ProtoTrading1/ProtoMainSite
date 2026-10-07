import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

for (const scenario of ['protected-missing-session', 'baseline-omit', 'protected-no-cookie', 'non-json-config', 'unavailable-config']) {
  test(`actual browser transport ${scenario}`, async () => {
    const requests = [];
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      requests.push({ path: url.pathname, method: req.method, hasPlatformCookie: Boolean(req.headers.cookie?.includes('fixture_platform=approved')) });
      if (url.pathname === '/api/basket-check-session') {
        if (!req.headers.cookie?.includes('fixture_platform=approved')) { res.writeHead(302, { Location: '/platform-login' }); res.end(); return; }
        if (scenario === 'non-json-config') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>Platform login</html>'); return; }
        if (scenario === 'unavailable-config') { res.writeHead(503); res.end(); return; }
        assert.equal(url.searchParams.get('mode'), 'config');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ version: 1, sessionStorageKey: 'sb-abcdefghijklmnopqrst-auth-token' })); return;
      }
      if (!['/basket-check.html', '/basket-check.css', '/basket-check.js'].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
      try {
        res.setHeader('Content-Type', url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
        let body = await readFile(new URL(`../dist${url.pathname}`, import.meta.url));
        // Controlled before/after reproduction: change only the frozen
        // transport setting back to omit, never a real deployment or token.
        if (scenario === 'baseline-omit' && url.pathname === '/basket-check.js') body = Buffer.from(body.toString().replace("credentials: 'same-origin'", "credentials: 'omit'"));
        res.end(body);
      }
      catch { res.writeHead(500); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 390, height: 860 } });
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (scenario !== 'protected-no-cookie') await context.addCookies([{ name: 'fixture_platform', value: 'approved', url: origin, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage();
      await page.goto(`${origin}/basket-check.html`);
      assert.equal(requests.some(r => r.path.startsWith('/api/')), false);
      await page.locator('#check-button').click();
      await page.waitForFunction(() => !document.querySelector('#check-button').disabled);
      const status = await page.locator('#status').textContent();
      assert.match(status, scenario === 'protected-missing-session' ? /not signed in to Proto/ : /could not safely read/);
      assert.equal(await page.locator('#report').isVisible(), false);
      assert.equal(await page.locator('#consent').isDisabled(), true);
      assert.equal(await page.locator('#copy-button').isDisabled(), true);
      const api = requests.filter(r => r.path.startsWith('/api/'));
      assert.equal(api.length, 1); assert.equal(api[0].hasPlatformCookie, !['protected-no-cookie', 'baseline-omit'].includes(scenario));
      assert.equal(requests.some(r => r.path === '/platform-login'), false);
      assert.ok(requests.every(r => r.method === 'GET'));
      assert.equal(await page.evaluate(() => localStorage.length), 0);
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  });
}

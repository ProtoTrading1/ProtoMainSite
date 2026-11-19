import { test, expect } from '@playwright/test';

test('a cached 5,000-product Instore catalogue searches without a network round trip or long freeze', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cpuSlowdown = Number(test.info().project.metadata.cpuSlowdown || 1);
  if (cpuSlowdown > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  }
  await context.route('**/api/stock*', route => route.fulfill({ json: {
    qty: 20, unitsOfIssue: 'EACH', unitsOfIssueRaw: 'EACH', unitsOfIssueVerified: true,
    unitsOfIssueSource: 'positill_live', availability: { state: 'in_stock', canOrder: true },
  } }));
  let requests = 0;
  await context.route('**/api/extended-range*', async route => {
    requests++;
    // Background refresh can remain slow; interactive cached searches must not wait.
    await route.fulfill({ status: 503, json: { error: 'Synthetic refresh unavailable' } });
  });
  await page.goto('/e2e/fixtures/instore-search-speed.html');
  await expect(page.locator('.instore-summary')).toContainText('5,000');
  const input = page.getByRole('searchbox', { name: 'Search Instore Products' });
  const timings = [];
  for (const [query, total, name] of [['bracelets', '278', 'DRAWSTRING BRACELET ORANGE'], ['hair clips', '278', 'HAIR CLIP PURPLE'], ['K100032', '1', 'T SHIRT XL GREY'], ['doesnotexist', 'No matches', null]]) {
    await input.fill(query);
    const started = Date.now();
    await input.press('Enter');
    if (total === 'No matches') await expect(page.getByRole('heading', { name: `No products match “${query}”` })).toBeVisible();
    else {
      await expect(page.locator('.instore-summary strong')).toHaveText(new RegExp(`^\\d+–\\d+ of ${total} products for “${query}”$`));
      await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
      if (query === 'K100032') await expect(page.locator('.instore-grid .pc-sku-code')).toHaveText('SKU: K100032 | BARCODE: 8600000032');
    }
    const elapsed = Date.now() - started;
    timings.push({ query, elapsed });
    // Broad enough for CI variance, but catches the original multi-second matcher.
    expect(elapsed, `${query} search freezes the page`).toBeLessThan(1500);
  }
  const beforeClear = requests;
  expect(beforeClear).toBe(1);
  await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
  await expect(page.locator('.instore-summary')).toContainText('5,000');
  expect(requests).toBe(beforeClear);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ project: test.info().project.name, cpuSlowdown, timings }));
  await test.info().attach('search-response-timings', { body: JSON.stringify(timings), contentType: 'application/json' });
});

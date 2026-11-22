import { test, expect } from '@playwright/test';

const fixture = '/e2e/fixtures/instore-history-scroll.html#/?q=notebook';
const scroll = page => page.evaluate(() => ({ window: scrollY, content: document.querySelector('.content-area').scrollTop }));
async function open(page) {
  await page.goto(fixture);
  await expect(page.getByRole('heading', { name: 'Main ready' })).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0, 350); document.querySelector('.content-area').scrollTop = 700; });
  await expect.poll(() => scroll(page)).toEqual({ window: 350, content: 700 });
}

test('browser Back waits for Main layout and Forward/Back restores the same entry again', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Instore', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'instore-products' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Main loading' })).toBeVisible();
  expect(await scroll(page)).toEqual({ window: 0, content: 0 });
  await expect.poll(() => scroll(page)).toEqual({ window: 350, content: 700 });
  await page.evaluate(() => { window.scrollTo(0, 420); document.querySelector('.content-area').scrollTop = 900; });
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'instore-products' })).toBeVisible();
  await page.goBack();
  await expect.poll(() => scroll(page)).toEqual({ window: 420, content: 900 });
});

test('explicit navigation to the same Main URL remains a new entry at the top', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Instore', exact: true }).click();
  await page.getByRole('button', { name: 'New Main', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Main ready' })).toBeVisible();
  expect(await scroll(page)).toEqual({ window: 0, content: 0 });
});

test('navigation cancels a proven pending return before readiness is released', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const gate = page.getByTestId('restoration-gate');
  await page.getByRole('button', { name: 'Hold restoration readiness', exact: true }).click();
  await expect(gate).toHaveAttribute('data-held', 'true');
  await expect(gate).toHaveAttribute('data-queued', '0');
  await page.getByRole('button', { name: 'Instore', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'instore-products' })).toBeVisible();
  await page.goBack();
  // Stable until explicit release: this proves the real controller has queued
  // restoration, without racing the fixture's 300 ms loading presentation.
  await expect(gate).toHaveAttribute('data-queued', '1');
  await expect(gate).toHaveAttribute('data-retained', '1');
  expect(await scroll(page)).toEqual({ window: 0, content: 0 });
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'other', exact: true })).toBeVisible();
  const capacity = await page.evaluate(() => {
    const content = document.querySelector('.content-area');
    return { window: document.scrollingElement.scrollHeight - innerHeight, content: content.scrollHeight - content.clientHeight };
  });
  expect(capacity.window).toBeGreaterThanOrEqual(350);
  expect(capacity.content).toBeGreaterThanOrEqual(700);
  await expect(gate).toHaveAttribute('data-queued', '0');
  await expect(gate).toHaveAttribute('data-cancelled', '1');
  await expect(gate).toHaveAttribute('data-retained', '1');
  await page.getByRole('button', { name: 'Release restoration readiness', exact: true }).click();
  await expect(gate).toHaveAttribute('data-held', 'false');
  await expect(gate).toHaveAttribute('data-delivered', '1');
  await expect(gate).toHaveAttribute('data-retained', '0');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await scroll(page)).toEqual({ window: 0, content: 0 });
  expect(errors).toEqual([]);
});

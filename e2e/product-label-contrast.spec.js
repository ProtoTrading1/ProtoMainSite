import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const scenarios = [
  { name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
];

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function renderedContrast(locator) {
  const colors = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    const backgrounds = [];
    let ancestor = element;
    const ancestorOpacities = [];
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      ancestorOpacities.push(Number(style.opacity));
      backgrounds.push(style.backgroundColor);
      ancestor = ancestor.parentElement;
    }
    return { foreground, backgrounds, ancestorOpacities };
  });

  // Product cards in these in-stock catalogue fixtures are fully opaque. Fail
  // explicitly if a future style introduces group opacity that would make the
  // computed text colour differ from its rendered colour.
  expect(colors.ancestorOpacities.every((opacity) => opacity === 1)).toBe(true);
  const backgroundChannels = colors.backgrounds.slice().reverse().reduce((under, layer) => {
    const [red, green, blue, alpha = 1] = layer.match(/[\d.]+/g).map(Number);
    if (alpha === 0) return under;
    const over = [red, green, blue];
    return under.map((channel, index) => channel * (1 - alpha) + over[index] * alpha);
  }, [255, 255, 255]);
  const background = `rgb(${backgroundChannels.join(', ')})`;
  const ratio = contrastRatio(colors.foreground, background);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  return ratio;
}

for (const scenario of scenarios) {
  test(`VAT and selling-unit labels meet contrast in ${scenario.name} catalogue cards`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: scenario.viewport, isMobile: scenario.isMobile });
    await installAccessibilityServices(context);
    const page = await context.newPage();

    try {
      await signInCatalogue(page);
      const examples = [
        { name: 'NOTEBOOK | A5 | BLUE', unit: 'Each', suffix: 'per item' },
        { name: 'PENCILS | PACK OF 12', unit: 'Pack of 12', suffix: 'per pack' },
      ];

      for (const example of examples) {
        const card = page.locator('.product-card').filter({ hasText: example.name });
        await expect(card).toBeVisible();
        const vat = card.locator('.pc-price-vat');
        const orderQuantity = card.locator('.pc-order-quantity');
        await expect(vat).toHaveText(`Incl. VAT · ${example.suffix}`);
        await expect(orderQuantity).toHaveText(`Minimum 1 · ${example.unit}`);
        await expect(vat).toBeVisible();
        await expect(orderQuantity).toBeVisible();
        expect(await renderedContrast(vat)).toBeGreaterThanOrEqual(4.5);
        expect(await renderedContrast(orderQuantity)).toBeGreaterThanOrEqual(4.5);
      }

      const screenshotPath = testInfo.outputPath(`catalogue-${scenario.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await testInfo.attach(`catalogue-${scenario.name}`, { path: screenshotPath, contentType: 'image/png' });
    } finally {
      await context.close();
    }
  });
}

// Synthetic published catalogue metadata and authenticated source observations.
// Keep these mocks faithful to the live-stock contract; never alter app policy.
export function withFixtureStockProof(product, now = Date.now()) {
  if (!product || typeof product !== 'object' || product.isExtendedRange || ['8-34', '8640000274'].includes(product.sku)) return product;
  if (product.isVariantGroup) return { ...product, variants: (product.variants || []).map(row => withFixtureStockProof(row, now)) };
  if (Object.hasOwn(product, 'stockSource')) return product;
  const qty = product.stockOnHand ?? product.stockQty;
  if (!Number.isSafeInteger(qty)) return product;
  return { ...product, stockOnHand: Math.max(0, qty), stockQty: Math.max(0, qty), unitsOfIssue: product.unitsOfIssue || 'EACH', stockUnitConfigured: true, stockSource: 'positill_live', stockCheckedAt: new Date(now).toISOString() };
}

export async function fixtureStockBody(route, body) {
  const url = new URL(route.request().url());
  if (url.pathname !== '/api/products' && !(url.pathname === '/api/stock' && url.searchParams.has('website_sku'))) return body;
  // Tests with Playwright's virtual clock must use that same source time.
  const now = await route.request().frame().evaluate(() => Date.now()).catch(() => Date.now());
  if (url.pathname === '/api/products' && Array.isArray(body)) return body.map(product => withFixtureStockProof(product, now));
  if (url.pathname === '/api/stock' && url.searchParams.has('website_sku') && !Object.hasOwn(body || {}, 'stock_source')) {
    const qty = Number.isSafeInteger(body?.qty) ? Math.max(0, body.qty) : null;
    if (qty !== null) return { ...body, qty, sku: url.searchParams.get('website_sku'), source_code: url.searchParams.get('sku'), available_stock: qty, stock_source: 'positill_live', checked_at: new Date(now).toISOString() };
  }
  return body;
}

export async function fulfillStockFixture(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? await fixtureStockBody(route, body) : body) });
}

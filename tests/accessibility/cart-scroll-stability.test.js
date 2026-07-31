import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('basket scroll stability', () => {
  it('reveals the exact added line without moving the basket for quantity edits', async () => {
    const drawer = await readFile(new URL('../../src/components/Drawer.jsx', import.meta.url), 'utf8');
    const app = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
    const styles = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');

    assert.match(app, /setCartRevealRequest\(\{ productId: product\.id, token:/);
    assert.match(drawer, /data-cart-product-id=\{item\.product\.id\}/);
    assert.match(drawer, /line\.scrollIntoView\(\{ block: 'nearest'/);
    assert.match(drawer, /prefers-reduced-motion: reduce/);
    assert.match(drawer, /drawer-line--just-added/);
    assert.match(drawer, /initialScrollTopRef/);
    assert.match(drawer, /onScrollPositionChangeRef\.current/);
    assert.doesNotMatch(drawer, /el\.scrollTo\(\{ top: el\.scrollHeight/);
    assert.match(styles, /\.drawer-line--just-added/);
  });
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('basket viewing space', () => {
  it('uses a compact header and checkout footer in both basket presentations', async () => {
    const styles = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');

    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-header \{[\s\S]*?min-height: 60px;[\s\S]*?padding: 8px 12px;/);
    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-footer \{[\s\S]*?padding: 8px 12px calc\(8px \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(styles, /\.mobile-cart-sheet-body \.primary-order-button \{ min-height: 50px; \}/);
    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-trust \{ display: none; \}/);
    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-items \{[\s\S]*?padding-right: 12px;[\s\S]*?padding-left: 12px;/);
    assert.match(styles, /@media \(min-width: 1201px\) \{[\s\S]*?\.cart-drawer \.drawer-header \{[\s\S]*?min-height: 60px;/);
    assert.match(styles, /\.cart-drawer \.drawer-footer \{ padding: 8px 12px; \}/);
    assert.match(styles, /\.cart-drawer \.drawer-trust \{ display: none; \}/);
  });
});

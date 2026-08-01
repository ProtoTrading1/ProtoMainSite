import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('basket viewing space', () => {
  it('uses a compact header and checkout footer in both basket presentations', async () => {
    const styles = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');

    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-header \{[\s\S]*?min-height: 52px;[\s\S]*?padding: 4px 8px 4px 12px;/);
    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-footer \{[\s\S]*?padding: 8px 12px calc\(8px \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(styles, /\.mobile-cart-sheet-body \.primary-order-button \{ min-height: 50px; \}/);
    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-trust \{ display: none; \}/);
    assert.match(styles, /\.mobile-cart-sheet-body \.drawer-items \{[\s\S]*?padding-right: 12px;[\s\S]*?padding-left: 12px;/);
    assert.match(styles, /@media \(min-width: 1201px\) \{[\s\S]*?\.cart-drawer \.drawer-header \{[\s\S]*?min-height: 52px;/);
    assert.match(styles, /\.cart-drawer \.drawer-footer \{ padding: 8px 12px; \}/);
    assert.match(styles, /\.cart-drawer \.drawer-trust \{ display: none; \}/);
  });

  it('keeps the compact black header branded and accessible', async () => {
    const drawer = await readFile(new URL('../../src/components/Drawer.jsx', import.meta.url), 'utf8');
    const styles = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');

    assert.match(drawer, /className="drawer-title-group"/);
    assert.match(drawer, /className="drawer-header-actions"/);
    assert.match(drawer, /className="drawer-item-count"/);
    assert.match(drawer, /cartItems\.length === 1 \? 'product' : 'products'/);
    assert.match(drawer, /Saved to account/);
    assert.match(drawer, /Saving…/);
    assert.match(drawer, /Saved on this device/);
    assert.match(drawer, /className="cart-saved-pill">\{syncLabel\}/);
    assert.match(drawer, /cart-expiry-pill--\$\{cartExpiryTone\}`}>\{expiryLabel\}/);
    assert.doesNotMatch(drawer, /Cart expires:/);
    assert.match(styles, /\.drawer-header \{[\s\S]*?background: #000;[\s\S]*?border-bottom: 1px solid rgba\(200, 154, 60, 0\.7\);/);
    assert.match(styles, /\.drawer-header-actions \{[\s\S]*?white-space: nowrap;/);
    assert.match(styles, /\.drawer-close-button \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
    assert.match(styles, /\.drawer-close-button:focus-visible \{[\s\S]*?outline: none;/);
    assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.drawer-close-button:focus-visible \{[\s\S]*?outline: 2px solid rgba\(200, 154, 60, 0\.72\);[\s\S]*?outline-offset: -4px;/);
  });
});

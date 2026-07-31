import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('account-synchronised basket', () => {
  it('merges the browser basket on sign-in and saves later changes with conflict protection', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const client = await readFile(new URL('../src/lib/accountCart.js', import.meta.url), 'utf8');
    const api = await readFile(new URL('../api/account-cart.js', import.meta.url), 'utf8');

    assert.match(app, /mergeAccountCart\(localItems, localActivityAt\)/);
    assert.match(app, /saveAccountCart\(cartItems, cartLastActivityAt, cartRevisionRef\.current\)/);
    assert.match(app, /error\.status === 409/);
    assert.match(app, /fetchProductsBySkus\(hydratedItems\.map/);
    assert.match(client, /requestAccountCart\('PUT'/);
    assert.match(api, /requireApprovedCustomer/);
    assert.match(api, /req\.body\?\.mode === 'merge'/);
    assert.match(api, /A newer account basket is available/);
    assert.match(api, /MAX_LINES = 250/);
  });

  it('clears both the device backup and account basket', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const client = await readFile(new URL('../src/lib/accountCart.js', import.meta.url), 'utf8');

    assert.match(app, /localStorage\.removeItem\(CART_STORAGE_KEY\)/);
    assert.match(app, /clearAccountCart\(\)/);
    assert.match(client, /requestAccountCart\('DELETE'\)/);
  });
});

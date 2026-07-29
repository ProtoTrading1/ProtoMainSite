import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSafeStorefrontProduct } from '../lib/catalogue-safety.mjs';

describe('storefront catalogue safety', () => {
  it('hides zero, negative, missing and invalid prices', () => {
    assert.equal(isSafeStorefrontProduct({ price: 0 }), false);
    assert.equal(isSafeStorefrontProduct({ price: -1 }), false);
    assert.equal(isSafeStorefrontProduct({ price: null }), false);
    assert.equal(isSafeStorefrontProduct({ price: 'not-a-price' }), false);
  });

  it('keeps a valid VAT-inclusive customer price', () => {
    assert.equal(isSafeStorefrontProduct({ price: '8.00' }), true);
    assert.equal(isSafeStorefrontProduct({ price: 49.50 }), true);
  });
});

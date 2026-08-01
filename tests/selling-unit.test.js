import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUnitsOfIssue, sellingUnitDetails } from '../lib/selling-unit.mjs';

test('normalises Positill selling units', () => {
  assert.equal(normalizeUnitsOfIssue('ea'), 'EACH');
  assert.equal(normalizeUnitsOfIssue('pack10'), 'PACK 10');
  assert.equal(normalizeUnitsOfIssue('pkt x 20'), 'PACK 20');
  assert.equal(normalizeUnitsOfIssue('box of 12'), 'BOX 12');
});

test('explains what one basket quantity represents', () => {
  assert.deepEqual(sellingUnitDetails('PACK 10'), {
    code: 'PACK 10',
    label: 'Pack of 10',
    priceSuffix: 'per pack',
    unitsPerSellingUnit: 10,
  });
  assert.equal(sellingUnitDetails('').label, 'Each');
});

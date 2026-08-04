import test from 'node:test';
import assert from 'node:assert/strict';

import { uppercasePdfAddress } from '../../api/_order-pdf.js';
import { formatPdfAddress } from '../../api/send-order.js';

test('internal order PDF capitalises invoice and delivery addresses', () => {
  assert.equal(
    formatPdfAddress('12 Main Road, Woodstock, Cape Town, 7925'),
    '12 MAIN ROAD\nWOODSTOCK\nCAPE TOWN\n7925',
  );
  assert.equal(formatPdfAddress('', 'To confirm'), 'TO CONFIRM');
});

test('stored fulfilment PDF capitalises every address source', () => {
  assert.equal(
    uppercasePdfAddress('Unit 4, 20 Loop Street, Cape Town'),
    'UNIT 4, 20 LOOP STREET, CAPE TOWN',
  );
  assert.equal(uppercasePdfAddress('', 'To confirm'), 'TO CONFIRM');
});

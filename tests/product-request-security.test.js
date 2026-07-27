import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImagePayload } from '../api/product-request.js';

test('accepts a real PNG payload', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.deepEqual(validateImagePayload(png.toString('base64'), 'image/png'), {
    ok: true,
    detectedType: 'image/png',
  });
});

test('rejects executable text disguised as an image', () => {
  const fake = Buffer.from('<script>alert(1)</script>');
  assert.equal(validateImagePayload(fake.toString('base64'), 'image/png').ok, false);
});

test('rejects a claimed type that differs from the file signature', () => {
  const gif = Buffer.from('GIF89a payload');
  assert.equal(validateImagePayload(gif.toString('base64'), 'image/jpeg').ok, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { RESET_HTML } from '../api/send-reset-email.js';

test('password reset email uses an email-safe branded layout', () => {
  const link = 'https://proto.co.za/#/reset-password?token=test-token';
  const html = RESET_HTML(link);

  assert.match(html, /role="presentation"/);
  assert.match(html, /mso-padding-alt:15px 34px/);
  assert.match(html, /bgcolor="#c40000"/);
  assert.match(html, />Reset my password</);
  assert.match(html, /Secure, single-use link/);
  assert.match(html, /expires in 15 minutes/);
  assert.match(html, /Your password will not change unless the secure link is used/);
  assert.equal((html.match(new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 3);
});

test('password reset email does not depend on a remote logo image', () => {
  const html = RESET_HTML('https://proto.co.za/reset');

  assert.doesNotMatch(html, /<img\b/i);
  assert.match(html, /PROTO <span[^>]*>TRADING<\/span>/);
  assert.match(html, /x-apple-disable-message-reformatting/);
});

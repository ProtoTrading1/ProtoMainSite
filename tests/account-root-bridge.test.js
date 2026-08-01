import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = fs.readFileSync(new URL('../src/Root.jsx', import.meta.url), 'utf8');

test('registration recovery carries the email and selected mode into sign-in', () => {
  assert.match(root, /const \[loginOptions, setLoginOptions\]/);
  assert.match(root, /initialEmail: String\(options\?\.initialEmail/);
  assert.match(root, /initialMode: options\?\.initialMode === 'forgot'/);
  assert.match(root, /initialEmail=\{loginOptions\.initialEmail\}/);
  assert.match(root, /initialMode=\{loginOptions\.initialMode\}/);
  assert.match(root, /onLogin=\{openLogin\}/);
});

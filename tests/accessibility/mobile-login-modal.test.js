import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('names the mobile sign-in dialog controls and explains registration routes', async () => {
  const modal = await readSource('src/components/LoginModal.jsx');

  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby="login-modal-heading"/);
  assert.match(modal, /aria-label="Close sign-in"/);
  assert.match(modal, /aria-label=\{showPw \? 'Hide password' : 'Show password'\}/);
  assert.match(modal, /Bought from Proto before, but not online\?/);
  assert.match(modal, /New trade customer\?/);
  assert.match(modal, /Re-register or apply/);
  assert.match(modal, /focusableSelector/);
  assert.match(modal, /previouslyFocused\.focus\(\)/);
  assert.match(modal, /htmlFor="login-email"/);
  assert.match(modal, /htmlFor="login-password"/);
});

test('keeps all secondary sign-in actions at least 44px tall', async () => {
  const styles = await readSource('src/landing.css');

  assert.match(styles, /\.lm-close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(styles, /\.lm-eye\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(styles, /\.lm-apply-link\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(styles, /\.lm-forgot-link\s*\{[\s\S]*?min-height:\s*44px;/);
});

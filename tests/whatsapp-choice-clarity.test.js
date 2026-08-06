import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const register = read('../src/pages/RegisterPage.jsx');
const landing = read('../src/pages/LandingPage.jsx');
const questionnaire = read('../src/components/Questionnaire.jsx');
const checkout = read('../src/components/CheckoutModal.jsx');
const profile = read('../src/pages/ProfilePage.jsx');
const landingCss = read('../src/landing.css');
const indexCss = read('../src/index.css');

test('every WhatsApp opt-in makes the negative choice explicit', () => {
  for (const source of [register, landing, questionnaire, checkout]) {
    assert.match(source, /No WhatsApp updates/);
    assert.match(source, /aria-pressed=/);
  }
});

test('selected negative choices have an unmistakable visual state', () => {
  assert.match(landingCss, /button\.selected\.no[\s\S]*background: #fff;[\s\S]*border-color: #fff;/);
  assert.match(indexCss, /checkout-modal-whatsapp-actions \.checkout-modal-btn--secondary\.selected[\s\S]*background: #0f172a;/);
  for (const source of [landing, questionnaire]) {
    assert.match(source, /whatsappOptIn === false \? '#fff' : 'transparent'/);
    assert.match(source, /✓ No WhatsApp updates/);
    assert.match(source, /minHeight: '48px'/);
  }
  assert.match(landingCss, /lp-register-whatsapp-actions button[\s\S]*min-height: 48px/);
  assert.match(indexCss, /checkout-modal-whatsapp-actions \.checkout-modal-btn[\s\S]*min-height: 48px/);
});

test('the customer profile explains both stored consent states', () => {
  assert.match(profile, /On — order updates, stock alerts & specials/);
  assert.match(profile, /Off — no WhatsApp updates/);
});

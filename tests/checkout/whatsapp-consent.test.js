import assert from 'node:assert/strict';
import test from 'node:test';

import { isWhatsappConsentUnset } from '../../src/lib/whatsappConsent.js';

test('checkout asks for WhatsApp consent only when the preference is unset', () => {
  assert.equal(isWhatsappConsentUnset(undefined), true);
  assert.equal(isWhatsappConsentUnset(null), true);
  assert.equal(isWhatsappConsentUnset(true), false);
  assert.equal(isWhatsappConsentUnset(false), false);
});

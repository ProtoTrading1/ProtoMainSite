import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the registration route keeps the full landing experience and replaces only its hero', async () => {
  const [landing, root, applySection] = await Promise.all([
    readFile(new URL('../../src/pages/LandingPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/Root.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/landing/LandingApplySection.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(root, /const registrationLanding =/);
  assert.match(root, /<LandingPage\s+registrationMode/);
  assert.doesNotMatch(root, /<RegisterPage/);
  assert.match(landing, /registrationMode\s*\?\s*<RegistrationCampaignHero/);
  assert.match(landing, /:\s*<LandingHero/);
  assert.match(landing, /<LandingMapSection \/>/);
  assert.match(landing, /<LandingDepartmentsSection \/>/);
  assert.match(landing, /<LandingApplySection registrationMode=\{registrationMode\}>/);
  assert.match(landing, /src="\/register-reregister-banner-v3\.webp"/);
  assert.match(landing, /Existing customers must re-register/);
  assert.match(landing, /New customers can apply for online access/);
  assert.match(landing, /getElementById\('lp-apply'\)\?\.scrollIntoView/);
  assert.match(applySection, /Existing customers re-register\. New customers apply online\./);
  assert.match(applySection, /reviewed before online purchasing access is approved/);
  assert.doesNotMatch(landing, /approve you instantly/);
});

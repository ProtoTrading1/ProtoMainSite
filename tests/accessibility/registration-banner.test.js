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
  // The hero's wording is markup now, not pixels in the banner file, so the
  // campaign copy is asserted as text and the image only carries photography.
  assert.match(landing, /src="\/register-hero-art\.webp"/);
  assert.match(landing, /Existing customers must <strong>re-register<\/strong>/);
  assert.match(landing, /New customers can apply for <strong>online access<\/strong>/);
  assert.match(landing, /Welcome to our new/);
  assert.match(landing, /does not\s+create an account at our physical store/);
  assert.match(landing, /getElementById\('lp-apply'\)\?\.scrollIntoView/);
  assert.match(applySection, /Existing customers re-register\. New customers apply online\./);
  assert.match(applySection, /reviewed before online purchasing access is approved/);
  assert.doesNotMatch(landing, /approve you instantly/);
});

test('the public root carries the launch campaign, not the evergreen hero', async () => {
  // Both entry points render the re-register campaign: register.proto.co.za
  // and /register via registrationLanding, and site.proto.co.za via the
  // fall-through landing at the end of Root.
  const root = await readFile(new URL('../../src/Root.jsx', import.meta.url), 'utf8');
  const registrationLandings = root.match(/<LandingPage\s+registrationMode/g) || [];
  assert.equal(
    registrationLandings.length,
    2,
    'both the registration route and the public root must render the campaign hero',
  );
  assert.doesNotMatch(
    root,
    /<LandingPage\n\s+onLogin/,
    'no LandingPage is left without registrationMode while the launch campaign is running',
  );
});

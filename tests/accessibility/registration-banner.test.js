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
  // The banner file itself is unchanged — no new asset, no crop, no swap.
  assert.match(landing, /src="\/register-reregister-banner-v3\.webp"/);
  // Its wording is markup now, so it can be reworded without new artwork.
  assert.match(landing, /Welcome to our new/);
  assert.match(landing, /Existing customers must <strong>re-register<\/strong>/);
  assert.match(landing, /New customers can apply for <strong>online access<\/strong>/);
  assert.match(landing, /does not\s+create an account at our physical store/);
  assert.match(landing, /getElementById\('lp-apply'\)\?\.scrollIntoView/);
  assert.match(applySection, /Existing customers re-register\. New customers apply online\./);
  assert.match(applySection, /reviewed before online purchasing access is approved/);
  assert.doesNotMatch(landing, /approve you instantly/);
});

test('the public root carries the launch campaign, not the evergreen hero', async () => {
  const root = await readFile(new URL('../../src/Root.jsx', import.meta.url), 'utf8');
  const campaignLandings = root.match(/<LandingPage\s+registrationMode/g) || [];
  assert.equal(
    campaignLandings.length,
    2,
    'both the registration route and the public root must render the campaign hero',
  );
});

test('the hero copy scales with the banner so it can never overflow it', async () => {
  // Every size in the copy panel is a fraction of the banner's own width, so
  // the text keeps the artwork's proportions from a 1716px desktop down to a
  // 374px phone. A px or vw value here would overflow the banner on mobile.
  const css = await readFile(new URL('../../src/landing.css', import.meta.url), 'utf8');
  const copyBlock = css.slice(
    css.indexOf('.registration-campaign-hero__copy {'),
    css.indexOf('.rch-cta:focus-visible'),
  );
  assert.match(css, /\.registration-campaign-hero__frame \{[^}]*container-type: inline-size/);
  assert.doesNotMatch(copyBlock, /font-size:[^;]*\dpx/, 'copy sizes must not be fixed px');
  assert.doesNotMatch(copyBlock, /font-size:[^;]*vw/, 'copy sizes must key off the banner, not the viewport');
  for (const rule of ['.rch-headline', '.rch-lede', '.rch-note', '.rch-cta']) {
    const at = copyBlock.indexOf(`${rule} {`);
    assert.ok(at !== -1, `${rule} must be defined in the hero copy block`);
    assert.match(copyBlock.slice(at, copyBlock.indexOf('}', at)), /font-size: [\d.]+cqw/, `${rule} sizes in cqw`);
  }
});

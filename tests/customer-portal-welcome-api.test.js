import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('migrations/064_customer_portal_welcome_seen.sql');
const migrationLedger = read('migrations/README.md');
const api = read('api/customer-profile.js');
const authClient = read('src/lib/auth.js');

test('migration adds a nullable one-way portal welcome marker safely', () => {
  assert.match(
    migration,
    /alter table if exists public\.customers\s+add column if not exists portal_welcome_seen_at timestamptz;/i,
  );
  assert.doesNotMatch(migration, /portal_welcome_seen_at timestamptz\s+not null/i);
  assert.match(migration, /comment on column public\.customers\.portal_welcome_seen_at/i);
  assert.match(migration, /one-way marker/i);
});

test('migration backfills only matching customers who have already signed in', () => {
  assert.match(migration, /from auth\.users as auth_user/i);
  assert.match(migration, /customer\.id = auth_user\.id/i);
  assert.match(migration, /set portal_welcome_seen_at = auth_user\.last_sign_in_at/i);
  assert.match(migration, /customer\.portal_welcome_seen_at is null/i);
  assert.match(migration, /auth_user\.last_sign_in_at is not null/i);
  assert.doesNotMatch(migration, /set portal_welcome_seen_at = (?:now\(\)|current_timestamp)/i);
});

test('release documentation requires the welcome marker before the four-state journey', () => {
  assert.match(migrationLedger, /064_customer_portal_welcome_seen\.sql/);
  assert.match(
    migrationLedger,
    /064_customer_portal_welcome_seen\.sql[^\n]*Apply before releasing the four-state customer journey/i,
  );
  assert.match(migrationLedger, /064_customer_portal_welcome_seen\.sql[^\n]*sends nothing/i);
});

test('authenticated marker action is self-scoped, one-way and idempotent', () => {
  const markerAction = api.slice(
    api.indexOf('if (markPortalWelcomeSeen === true)'),
    api.indexOf("if (typeof acceptWhatsapp !== 'boolean')"),
  );

  assert.match(api, /const user = await requireAuth\(req, res\);/);
  assert.match(markerAction, /markPortalWelcomeSeen === true/);
  assert.match(markerAction, /update\(\{ portal_welcome_seen_at: markedAt \}\)/);
  assert.match(markerAction, /\.eq\('id', user\.id\)/);
  assert.match(markerAction, /\.is\('portal_welcome_seen_at', null\)/);
  assert.match(
    markerAction,
    /if \(!profile\)[\s\S]*\.select\('id, portal_welcome_seen_at'\)[\s\S]*\.eq\('id', user\.id\)/,
  );
  assert.doesNotMatch(markerAction, /portal_welcome_seen_at:\s*(?:req\.body|markPortalWelcomeSeen)/);
  assert.doesNotMatch(markerAction, /\.eq\('id',\s*(?:req\.body|userId|body\.)/);
});

test('the explicit marker action does not replace the WhatsApp PATCH contract', () => {
  assert.match(api, /typeof acceptWhatsapp !== 'boolean'/);
  assert.match(api, /accept_whatsapp: acceptWhatsapp/);
  assert.match(api, /whatsapp_opt_in_at: acceptWhatsapp \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(api, /whatsappPhone\.trim\(\)/);
});

test('client helper sends only the action and preserves structured failures', () => {
  assert.match(authClient, /export async function markPortalWelcomeSeen\(\)/);
  assert.match(
    authClient,
    /fetch\('\/api\/customer-profile',[\s\S]*method: 'PATCH',[\s\S]*headers: await authHeaders\(\),[\s\S]*JSON\.stringify\(\{ markPortalWelcomeSeen: true \}\)/,
  );
  assert.match(authClient, /error\.status = res\.status/);
  assert.match(authClient, /error\.code = data\.code \|\| 'PORTAL_WELCOME_MARK_FAILED'/);
  assert.match(authClient, /error\.data = data/);
  assert.match(authClient, /return data\.portalWelcomeSeenAt/);
});

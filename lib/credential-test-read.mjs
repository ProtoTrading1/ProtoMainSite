import { createStockClient, resolveStockCredentials } from './stock-supabase.mjs';

const TEST_URL = 'https://pyrwimlmmruxtuxhdsom.supabase.co';
const TEST_BRANCH = 'codex/stock-credentials-test-20261019';
export const FIXTURE_SKUS = Object.freeze([
  'SYN-E2E-101-IMG-7C566A908ACD43F3866DC39FC1D7110C',
  'SYN-E2E-101-IMG-CB175B37290249E1AE020730C2AF83C3',
  'SYN-E2E-100-IMG-AD212E98983F0D152C4EA50F57207F93',
]);

const numericEquals = (value, expected) => ['string', 'number'].includes(typeof value) && String(value).trim() !== '' && Number(value) === expected;

export function credentialTestScopeFailure(env) {
  if (env.VERCEL_ENV !== 'preview') return 'scope_environment';
  if (env.VERCEL_GIT_COMMIT_REF !== TEST_BRANCH) return 'scope_branch';
  if (env.PREVIEW_READ_ONLY !== '1') return 'scope_read_only';
  if (typeof env.STOCK_SUPABASE_KEY !== 'string' || !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(env.STOCK_SUPABASE_KEY)) return 'scope_binding';
  try { return resolveStockCredentials(env).url === TEST_URL ? null : 'scope_target'; } catch { return 'scope_binding'; }
}

export function validCredentialTestScope(env) {
  return credentialTestScopeFailure(env) === null;
}

// Fixed synthetic Test rows only. No portal client, auth session, cache RPC or write path.
// This route is additionally behind the project's existing Vercel Preview SSO protection.
export function credentialTestReadHandler({ env = process.env, clientFactory = createStockClient } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
    const scopeFailure = credentialTestScopeFailure(env);
    if (scopeFailure) return res.status(404).json({ ok: false, error: scopeFailure });
    try {
      const client = clientFactory({ env });
      const { data, error, status } = await client.from('website_stock')
        .select('sku,price,stock_qty,available_stock').in('sku', [...FIXTURE_SKUS]).limit(4)
        .abortSignal(AbortSignal.timeout(8000));
      if (error) return res.status(502).json({ ok: false, error: status === 401 ? 'provider_auth_failed' : status === 403 ? 'provider_permission_denied' : 'provider_read_failed' });
      if (!Array.isArray(data)) return res.status(502).json({ ok: false, error: 'fixture_check_failed' });
      const identities = data.map(row => row?.sku);
      const fixturesPresent = data.length === 3 && new Set(identities).size === 3 && FIXTURE_SKUS.every(sku => identities.includes(sku));
      const pricesMatch = fixturesPresent && data.every(row => numericEquals(row.price, 11.50));
      const zero = data.find(row => row?.sku === FIXTURE_SKUS[2]);
      const frozenZeroStockMatches = Boolean(zero && numericEquals(zero.stock_qty, 0) && numericEquals(zero.available_stock, 0));
      const checks = { fixturesPresent, pricesMatch, frozenZeroStockMatches };
      const ok = Object.values(checks).every(Boolean);
      return res.status(ok ? 200 : 409).json({ ok, checks, fixtureCount: data.length });
    } catch {
      return res.status(502).json({ ok: false, error: 'provider_read_failed' });
    }
  };
}

export function renderCredentialTestRead(result) {
  const labels = { fixturesPresent: 'Three synthetic fixtures found', pricesMatch: 'Expected prices match', frozenZeroStockMatches: 'Frozen zero-stock values match' };
  const count = Number.isInteger(result.fixtureCount) && result.fixtureCount >= 0 && result.fixtureCount <= 4 ? result.fixtureCount : 0;
  const checks = Object.entries(labels).map(([key, label]) => `<li>${label}: <strong>${result.checks?.[key] === true ? 'PASS' : 'NOT PASSED'}</strong></li>`).join('');
  const failures = { scope_environment: 'Preview environment required', scope_branch: 'Exact Test branch required', scope_read_only: 'Test read-only mode required', scope_binding: 'Valid modern Test binding required', scope_target: 'Approved Test project required', provider_auth_failed: 'Test provider rejected the credential', provider_permission_denied: 'Test provider denied table access', provider_read_failed: 'Test provider read failed', fixture_check_failed: 'Unexpected Test provider response', method_not_allowed: 'GET request required' };
  const outcome = result.ok === true ? 'All checks passed' : Object.hasOwn(failures, result.error) ? failures[result.error] : 'Synthetic fixture checks did not pass';
  const title = result.ok === true ? 'Credential read check passed' : 'Credential read check did not pass';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Protected Test credential read</title><main style="font:18px system-ui;max-width:720px;margin:3rem auto;padding:1rem"><h1>${title}</h1><p>Protected Test preview. One bounded read of synthetic fixtures.</p><p>Result: <strong>${outcome}</strong></p><p>Fixtures returned: ${count}</p><ul>${checks}</ul><p>No stock, orders, emails or catalogue cache records were written by this check.</p></main></html>`;
}

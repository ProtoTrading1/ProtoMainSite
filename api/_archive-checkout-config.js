export const ARCHIVE_CHECKOUT_PATH = '/api/archive-checkout-dry-run';
export const ARCHIVE_CHECKOUT_SCOPE = 'archive-checkout-dry-run-v1';
export const ARCHIVE_CHECKOUT_BRANCH = 'agent/archive-test-readonly-main-20261012';
export const ARCHIVE_CHECKOUT_PORTAL = 'https://kyodrsqnmihwoplkhwwf.supabase.co';
export const ARCHIVE_CHECKOUT_STOCK = 'https://aovcrilrgistrdcgtdgl.supabase.co';
export const ARCHIVE_CHECKOUT_OWNER = '4809ae25-4058-4e65-8c5b-136f82adee43';
export const ARCHIVE_CHECKOUT_EMAIL = 'george@proto.co.za';
export function checkoutBlocked(code, status = 503) {
  throw Object.assign(new Error(code), { code, status });
}
export function validateArchiveCheckoutConfig(env, proof) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== ARCHIVE_CHECKOUT_BRANCH || env.ARCHIVE_TEST_READ_ONLY !== '1') checkoutBlocked('ARCHIVE_CHECKOUT_PREVIEW_REQUIRED');
  if (env.ARCHIVE_TEST_CHECKOUT_SCOPE !== ARCHIVE_CHECKOUT_SCOPE || env.VITE_ARCHIVE_TEST_CHECKOUT_SCOPE !== ARCHIVE_CHECKOUT_SCOPE) checkoutBlocked('ARCHIVE_CHECKOUT_SCOPE_REQUIRED');
  if (env.ARCHIVE_CHECKOUT_AUTH_URL !== ARCHIVE_CHECKOUT_PORTAL || env.VITE_SUPABASE_URL !== ARCHIVE_CHECKOUT_PORTAL || env.ARCHIVE_TEST_STOCK_URL !== ARCHIVE_CHECKOUT_STOCK) checkoutBlocked('ARCHIVE_CHECKOUT_TARGET_REJECTED');
  if (env.ARCHIVE_CHECKOUT_TEST_USER_ID !== ARCHIVE_CHECKOUT_OWNER || env.ARCHIVE_CHECKOUT_TEST_EMAIL !== ARCHIVE_CHECKOUT_EMAIL) checkoutBlocked('ARCHIVE_CHECKOUT_ACCOUNT_CONFIG_REJECTED');
  const sha = env.ARCHIVE_CHECKOUT_EXPECTED_COMMIT;
  if (!/^[0-9a-f]{40}$/.test(sha || '') || sha !== env.VERCEL_GIT_COMMIT_SHA) checkoutBlocked('ARCHIVE_CHECKOUT_SOURCE_REJECTED');
  if (!env.VERCEL_URL || !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL) || !env.VERCEL_DEPLOYMENT_ID || !/^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID)) checkoutBlocked('ARCHIVE_CHECKOUT_DEPLOYMENT_REQUIRED');
  if (!proof || proof.sha !== sha || proof.branch !== ARCHIVE_CHECKOUT_BRANCH || proof.environment !== 'preview' || proof.url !== env.VERCEL_URL || proof.deploymentId !== env.VERCEL_DEPLOYMENT_ID || proof.scope !== ARCHIVE_CHECKOUT_SCOPE) checkoutBlocked('ARCHIVE_CHECKOUT_BUILD_PROOF_REJECTED');
  if (!env.VITE_SUPABASE_ANON_KEY || !env.ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY) checkoutBlocked('ARCHIVE_CHECKOUT_CREDENTIAL_REQUIRED');
  return { sha, deploymentId: env.VERCEL_DEPLOYMENT_ID };
}
export function validateArchiveCheckoutRequest(req) {
  // Check the raw URL as well: URL.search omits a bare question mark.
  if (req.method !== 'POST' || req.url !== ARCHIVE_CHECKOUT_PATH || (req.query && Object.keys(req.query).length)) checkoutBlocked('ARCHIVE_CHECKOUT_REQUEST_REJECTED', 400);
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'qty,sku' || !['SYN-AR26-MAIN', 'SYN-AR26-STORE'].includes(body.sku) || !Number.isSafeInteger(body.qty) || body.qty < 1 || body.qty > 10) checkoutBlocked('ARCHIVE_CHECKOUT_PAYLOAD_REJECTED', 400);
  return { sku: body.sku, qty: body.qty };
}

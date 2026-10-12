import { createClient as sdkCreateClient } from '@supabase/supabase-js';
export const ARCHIVE_TEST_URL = 'https://aovcrilrgistrdcgtdgl.supabase.co';
export const ARCHIVE_TEST_BRANCH = 'agent/archive-test-readonly-main-20261012';
const readRpcs = new Set(['archive_review_capabilities', 'archive_review_receipt', 'archive_review_state', 'archive_review_catalogue_metadata', 'archive_review_catalogue_revision', 'archive_review_main_metadata', 'archive_review_main_revision', 'get_website_product_availability', 'get_website_product_availability_version']);
function blocked(code) { throw Object.assign(new Error(code), { code }); }
export function dedicatedArchiveTest(env = process.env) {
  return env.ARCHIVE_TEST_READ_ONLY === '1' || env.VERCEL_GIT_COMMIT_REF === ARCHIVE_TEST_BRANCH;
}
export function validateArchiveTestConfig(env = process.env) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== ARCHIVE_TEST_BRANCH || env.ARCHIVE_TEST_READ_ONLY !== '1') blocked('ARCHIVE_TEST_PREVIEW_REQUIRED');
  if (env.ARCHIVE_TEST_STOCK_URL !== ARCHIVE_TEST_URL) blocked('ARCHIVE_TEST_TARGET_REJECTED');
  if (!env.ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY) blocked('ARCHIVE_TEST_SERVER_CREDENTIAL_REQUIRED');
  return { url: ARCHIVE_TEST_URL, key: env.ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY };
}
export function archiveTestFetch(transport = globalThis.fetch) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (url.origin !== ARCHIVE_TEST_URL || url.username || url.password || url.hash) blocked('ARCHIVE_TEST_TARGET_REJECTED');
    const route = url.pathname.split('/').filter(Boolean);
    const tableRead = ['GET', 'HEAD'].includes(method) && route.length === 3 && route[0] === 'rest' && route[1] === 'v1';
    const rpcRead = method === 'POST' && route.length === 4 && route[0] === 'rest' && route[1] === 'v1' && route[2] === 'rpc' && readRpcs.has(route[3]);
    if (!tableRead && !rpcRead) blocked('ARCHIVE_TEST_WRITE_OR_ROUTE_REJECTED');
    let response;
    try { response = await transport(input, { ...init, redirect: 'manual', signal: init.signal || AbortSignal.timeout(15000) }); } catch { blocked('ARCHIVE_TEST_TRANSPORT_FAILED'); }
    if (response.redirected || (response.status >= 300 && response.status < 400)) blocked('ARCHIVE_TEST_REDIRECT_REJECTED');
    return response;
  };
}
export function createArchiveTestClient({ env = process.env, factory = sdkCreateClient, transport } = {}) {
  const { url, key } = validateArchiveTestConfig(env);
  return factory(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch: archiveTestFetch(transport) } });
}
// Existing non-dedicated source behavior is retained for regression tests.
export function createClient(url, key, options) {
  if (dedicatedArchiveTest()) return createArchiveTestClient();
  return sdkCreateClient(url, key, options);
}
export function archiveTestRequestBlock(request, env = process.env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return { status: 403, code: 'ARCHIVE_TEST_READ_ONLY' };
  if (!new Set(['/api/products', '/api/extended-range', '/api/customer-profile']).has(url.pathname) || url.searchParams.has('refresh')) return { status: 403, code: 'ARCHIVE_TEST_ROUTE_BLOCKED' };
  try { validateArchiveTestConfig(env); } catch (error) { return { status: 503, code: error.code }; }
  return null;
}

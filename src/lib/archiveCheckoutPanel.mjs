const scope = 'archive-checkout-dry-run-v1';
const branch = 'agent/archive-test-readonly-main-20261012';
const owner = '4809ae25-4058-4e65-8c5b-136f82adee43';
const email = 'george@proto.co.za';
export const fixtureSkus = Object.freeze(['SYN-AR26-MAIN', 'SYN-AR26-STORE']);
export function panelAvailable(context, publicScope, authUrl, hostname) {
  return !!context && context.environment === 'preview' && context.branch === branch
    && context.scope === scope && publicScope === scope
    && authUrl === 'https://kyodrsqnmihwoplkhwwf.supabase.co'
    && /^[a-f0-9]{40}$/.test(context.sha) && /^dpl_[A-Za-z0-9]+$/.test(context.deploymentId)
    && /^[a-z0-9-]+\.vercel\.app$/.test(context.url) && context.url === hostname;
}
export function sessionIssue(session, now = Date.now()) {
  if (session?.user?.id !== owner || session?.user?.email !== email) return 'ARCHIVE_CHECKOUT_OWNER_REQUIRED';
  if (typeof session.access_token !== 'string' || !session.access_token || /\s/.test(session.access_token)
    || !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= now) return 'ARCHIVE_CHECKOUT_UNAUTHORIZED';
  return null;
}
const errorCodes = new Set([
  'ARCHIVE_CHECKOUT_UNAUTHORIZED', 'ARCHIVE_CHECKOUT_OWNER_REQUIRED', 'ARCHIVE_CHECKOUT_PROFILE_REJECTED',
  'ARCHIVE_CHECKOUT_PRODUCT_REJECTED', 'ARCHIVE_CHECKOUT_PROVENANCE_REJECTED', 'ARCHIVE_CHECKOUT_READ_FAILED',
  'ARCHIVE_CHECKOUT_REDIRECT_REJECTED', 'ARCHIVE_CHECKOUT_REQUEST_REJECTED', 'ARCHIVE_CHECKOUT_PAYLOAD_REJECTED',
  'ARCHIVE_CHECKOUT_PREVIEW_REQUIRED', 'ARCHIVE_CHECKOUT_SCOPE_REQUIRED', 'ARCHIVE_CHECKOUT_TARGET_REJECTED',
  'ARCHIVE_CHECKOUT_ACCOUNT_CONFIG_REJECTED', 'ARCHIVE_CHECKOUT_SOURCE_REJECTED', 'ARCHIVE_CHECKOUT_DEPLOYMENT_REQUIRED',
  'ARCHIVE_CHECKOUT_BUILD_PROOF_REJECTED', 'ARCHIVE_CHECKOUT_CREDENTIAL_REQUIRED', 'ARCHIVE_CHECKOUT_VALIDATION_FAILED',
  'ARCHIVE_TEST_READ_ONLY',
]);
function failure(code, status = null, writesPerformed = null) { return { ok: false, code, status, writesPerformed }; }
export async function runFixtureValidation({ context, publicScope, authUrl, hostname, sku, qty, getSession, transport = globalThis.fetch, signal, timeoutMs = 15000 }) {
  if (!panelAvailable(context, publicScope, authUrl, hostname)) return failure('PANEL_UNAVAILABLE');
  if (!fixtureSkus.includes(sku) || !Number.isSafeInteger(qty) || qty < 1 || qty > 10) return failure('ARCHIVE_CHECKOUT_PAYLOAD_REJECTED');
  const session = getSession();
  const issue = sessionIssue(session);
  if (issue) return failure(issue);
  const unchanged = () => {
    const current = getSession();
    return !sessionIssue(current) && current.access_token === session.access_token && current.user.id === session.user.id && current.user.email === session.user.email;
  };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    if (controller.signal.aborted) return failure('VALIDATION_CANCELLED');
    // Explicit existing bearer snapshot: no SDK getSession/refresh, retries or session writes.
    const response = await transport('/api/archive-checkout-dry-run', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ sku, qty }),
    });
    if (!unchanged()) return failure('SESSION_CHANGED');
    if (controller.signal.aborted) return failure('VALIDATION_CANCELLED');
    if (response.redirected || response.status >= 300 && response.status < 400
      || response.url && new URL(response.url).origin !== `https://${hostname}`) return failure('UNVERIFIED_RESPONSE');
    const body = await response.json();
    if (!unchanged()) return failure('SESSION_CHANGED');
    if (controller.signal.aborted) return failure('VALIDATION_CANCELLED');
    if (body?.writesPerformed !== false) return failure('UNVERIFIED_RESPONSE', response.status);
    if (!response.ok) return failure(errorCodes.has(body.code) ? body.code : 'ARCHIVE_CHECKOUT_VALIDATION_FAILED', response.status, false);
    if (response.status !== 200 || body.ok !== true || body.mode !== 'validation-only' || body.sku !== sku || body.qty !== qty
      || body.sourceCommit !== context.sha || body.deploymentId !== context.deploymentId
      || typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0) return failure('UNVERIFIED_RESPONSE', response.status);
    // Copy only fixed/validated receipt fields; never display arbitrary response text.
    return { ok: true, status: 200, sku, qty, price: body.price, sourceCommit: context.sha, deploymentId: context.deploymentId, writesPerformed: false };
  } catch { return failure(controller.signal.aborted ? 'VALIDATION_CANCELLED' : 'VALIDATION_UNAVAILABLE'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

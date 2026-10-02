import { supabase } from './supabase';

const AUTH_SESSION_TIMEOUT_MS = 4000;
let currentAccessToken = null;
let currentAuthUserId = null;
let authGeneration = 0;
let authIdentity = { userId: null };
let sessionReadInFlight = null;

function timeoutAfter(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Keep authenticated requests off Supabase's cross-tab session lock during
 * normal portal use. Root calls this whenever auth is restored or refreshed.
 */
export function rememberAuthSession(session) {
  const userId = session?.user?.id || null;
  if (authIdentity.userId !== userId) authIdentity = { userId };
  currentAccessToken = session?.access_token || null;
  currentAuthUserId = userId;
  authGeneration += 1;
}

export function captureAuthIdentity() { return authIdentity; }

export function bindInitialAuthIdentity(identity, headers) {
  // A cold SDK restore may establish the first account while headers load.
  // Claim it once, only if those headers still belong to the remembered token.
  if (!identity.userId && headers.Authorization === `Bearer ${currentAccessToken}`) return authIdentity;
  assertAuthIdentity(identity);
  return identity;
}

export function assertAuthIdentity(identity) {
  if (identity === authIdentity) return;
  const changed = new Error('Your signed-in account changed. Please retry from the current account.');
  changed.code = 'AUTH_ACCOUNT_CHANGED';
  throw changed;
}

async function readAccessToken({ refresh = false } = {}) {
  if (!refresh && currentAccessToken) return currentAccessToken;
  const generation = authGeneration;
  const userId = currentAuthUserId;
  const identity = captureAuthIdentity();

  // Coalesce concurrent reads and refreshes. This matters on product grids:
  // two stock buttons receiving the same 401 must not compete for Supabase's
  // cross-tab refresh lock and recreate the original hang.
  if (!sessionReadInFlight) {
    const read = refresh
      ? supabase.auth.refreshSession()
      : supabase.auth.getSession();
    const pending = timeoutAfter(
      read,
      AUTH_SESSION_TIMEOUT_MS,
      'Authentication timed out. Please retry.',
    );
    const tracked = pending.finally(() => {
      if (sessionReadInFlight === tracked) sessionReadInFlight = null;
    });
    sessionReadInFlight = tracked;
  }

  const { data, error } = await sessionReadInFlight;
  if (userId) assertAuthIdentity(identity);
  // A retry belongs to the account that started it. Never let a delayed
  // session read retarget that request after another tab changes accounts.
  if ((userId && currentAuthUserId !== userId)
      || (userId && data?.session?.user?.id && data.session.user.id !== userId)) {
    const changed = new Error('Your signed-in account changed. Please retry from the current account.');
    changed.code = 'AUTH_ACCOUNT_CHANGED';
    throw changed;
  }
  if (generation !== authGeneration) {
    if (!currentAccessToken) throw new Error('Not authenticated');
    return currentAccessToken;
  }
  if (error) throw error;
  rememberAuthSession(data.session);
  if (!currentAccessToken) throw new Error('Not authenticated');
  return currentAccessToken;
}

export async function authHeaders(sessionOrToken = null, extraHeaders = {}) {
  const tokenFromArg = typeof sessionOrToken === 'string'
    ? sessionOrToken
    : sessionOrToken?.access_token;

  if (tokenFromArg) {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFromArg}`, ...extraHeaders };
  }

  const token = await readAccessToken();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders };
}

/**
 * Recover a customer request that was made just as its cached access token
 * expired. Callers must use this only after a 401 and retry once; service,
 * validation and stock errors must remain visible to the customer.
 */
export async function refreshAuthHeaders(extraHeaders = {}, identity = captureAuthIdentity()) {
  assertAuthIdentity(identity);
  currentAccessToken = null;
  const token = await readAccessToken({ refresh: true });
  assertAuthIdentity(identity);
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders };
}

/**
 * Authenticated GET helper for customer reads. It caps both session recovery
 * and the network request, and refreshes a stale access token once on 401.
 */
async function runAuthenticatedGet(url, {
  cache = 'no-store',
  signal = null,
  timeoutMs = 10000,
} = {}, consume = (response) => response) {
  let identity = captureAuthIdentity();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const request = async (refresh = false) => {
    if (identity.userId || refresh) assertAuthIdentity(identity);
    const token = await readAccessToken({ refresh });
    if (!refresh) identity = bindInitialAuthIdentity(identity, { Authorization: `Bearer ${token}` });
    assertAuthIdentity(identity);
    const response = await fetch(url, {
      cache,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    assertAuthIdentity(identity);
    return response;
  };

  try {
    let response = await request();
    if (response.status === 401 && !controller.signal.aborted) {
      assertAuthIdentity(identity);
      currentAccessToken = null;
      response = await request(true);
    }
    const result = await consume(response);
    assertAuthIdentity(identity);
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function authenticatedGet(url, options = {}) {
  return runAuthenticatedGet(url, options);
}

export function authenticatedGetJson(url, options = {}) {
  return runAuthenticatedGet(url, options, async (response) => ({
    response,
    data: await response.json(),
  }));
}

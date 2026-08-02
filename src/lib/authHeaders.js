import { supabase } from './supabase';

const AUTH_SESSION_TIMEOUT_MS = 4000;
let currentAccessToken = null;
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
  currentAccessToken = session?.access_token || null;
}

async function readAccessToken({ refresh = false } = {}) {
  if (!refresh && currentAccessToken) return currentAccessToken;

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
    currentAccessToken = tokenFromArg;
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFromArg}`, ...extraHeaders };
  }

  const token = await readAccessToken();
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
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const request = async (refresh = false) => {
    const token = await readAccessToken({ refresh });
    return fetch(url, {
      cache,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  };

  try {
    let response = await request();
    if (response.status === 401 && !controller.signal.aborted) {
      currentAccessToken = null;
      response = await request(true);
    }
    return await consume(response);
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

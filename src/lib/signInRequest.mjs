import { withDeadline } from './requestDeadline.mjs';

function signInError(code) {
  return Object.assign(new Error('Sign-in could not finish safely.'), { code });
}

export function hasFreshSignInSession(session, now = Date.now()) {
  try {
    const { exp, sub } = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof session.refresh_token === 'string' && Boolean(session.refresh_token.trim())
      && typeof session.user?.id === 'string' && sub === session.user.id
      && Number.isFinite(exp) && exp > now / 1000 + 60;
  } catch { return false; }
}

// Cancellation wins even if an isolated provider ignores AbortSignal. Only a
// returned, fresh session is eligible for the explicit shared-session commit.
export async function boundedSignInRequest(run, { signal, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let rejectCancellation;
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  const abort = () => {
    controller.abort();
    rejectCancellation(Object.assign(new Error('Request cancelled'), { name: 'AbortError', code: 'REQUEST_CANCELLED' }));
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    return await withDeadline(() => Promise.race([
      cancelled,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw signInError('REQUEST_CANCELLED');
        return run(controller.signal);
      }),
    ]), { timeoutMs, message: 'Sign-in took too long. Please try again.', onTimeout: () => controller.abort() });
  } finally { signal?.removeEventListener('abort', abort); }
}

// The shared SDK verifies the supplied token using /user before storing it.
// Bound the complete body and keep ownership checks in that transport so a
// stalled lock/body cannot write a session after an abandoned commit.
export function createSignInCommitTransport(fetchImpl, { timeoutMs = 15000 } = {}) {
  let active = null;
  const owners = new Map();
  return {
    async commit(session, saveSession, assertOwnership) {
      if (active) throw signInError('SIGN_IN_COMMIT_FAILED');
      const owner = { token: session.access_token, assertOwnership, active: true, failure: null };
      owners.set(owner.token, owner);
      active = owner;
      try {
        assertOwnership();
        const result = await withDeadline(saveSession, { timeoutMs, onTimeout: () => { owner.active = false; } });
        if (owner.failure) throw owner.failure;
        owners.delete(owner.token);
        return result;
      } catch {
        throw signInError('SIGN_IN_COMMIT_FAILED');
      } finally { owner.active = false; active = null; }
    },
    async fetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (!/\/auth\/v1\/user(?:\?|$)/.test(url)) return fetchImpl(input, init);
      const token = new Headers(init.headers || {}).get('Authorization')?.replace(/^Bearer\s+/i, '');
      const owner = owners.get(token);
      if (!owner) return fetchImpl(input, init);
      const check = () => {
        try {
          if (!owner.active) throw signInError('SIGN_IN_COMMIT_FAILED');
          owner.assertOwnership();
        } catch (error) { owner.failure = error; throw error; }
      };
      return boundedSignInRequest(async signal => {
        check();
        const response = await fetchImpl(input, { ...init, signal });
        const body = await response.arrayBuffer();
        if (signal.aborted) throw signInError('SIGN_IN_COMMIT_FAILED');
        check();
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      }, { timeoutMs, signal: init.signal });
    },
  };
}

export const signInCommitTransport = createSignInCommitTransport((...args) => globalThis.fetch(...args));

export function createIsolatedSignIn({ createProvisional, prepare, captureOwnership, assertOwnership, commitSession, timeoutMs = 15000, now = Date.now }) {
  let attempt = 0;
  return async (email, password, { signal, onCommit } = {}) => {
    const current = ++attempt;
    let provisional;
    let ownership;
    const check = () => {
      if (signal?.aborted || current !== attempt) throw signInError('SIGN_IN_SESSION_CHANGED');
      assertOwnership?.(ownership);
    };
    try {
      const response = await boundedSignInRequest(async requestSignal => {
        await prepare?.();
        if (requestSignal.aborted || current !== attempt) throw signInError('REQUEST_CANCELLED');
        ownership = captureOwnership?.();
        provisional = createProvisional(requestSignal);
        const result = await provisional.auth.signInWithPassword({ email: email.trim(), password });
        if (requestSignal.aborted) throw signInError('REQUEST_CANCELLED');
        return result;
      }, { signal, timeoutMs });
      check();
      if (response.error) throw response.error;
      if (!hasFreshSignInSession(response.data?.session, now())) throw signInError('SIGN_IN_INVALID_SESSION');
      onCommit?.();
      check();
      const result = await commitSession(response.data.session, check);
      if (result.error || !hasFreshSignInSession(result.data?.session, now())
        || result.data.session.user.id !== response.data.session.user.id) throw signInError('SIGN_IN_COMMIT_FAILED');
      return result.data;
    } finally { void Promise.resolve(provisional?.auth.stopAutoRefresh()).catch(() => {}); }
  };
}

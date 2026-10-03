import { withDeadline } from './requestDeadline.mjs';

// Cancellation wins even when a provider ignores AbortSignal. The provider's
// late result stays isolated and cannot reach the shared-session commit.
export async function boundedLoginRequest(run, {
  signal, timeoutMs = 15000, timeoutMessage = 'Sign in timed out. Check your connection and try again.',
} = {}) {
  const controller = new AbortController();
  let rejectCancellation;
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  const abort = () => {
    controller.abort();
    rejectCancellation(new DOMException('Request cancelled', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    return await withDeadline(() => Promise.race([
      cancelled,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        return run(controller.signal);
      }),
    ]), { timeoutMs, message: timeoutMessage, onTimeout: () => controller.abort() });
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export function createLoginTransport(fetchImpl, { timeoutMs = 15000, captureOwnership, assertOwnership } = {}) {
  let committing = false;
  let commitOwnership = null;
  let commitOwnershipFailure = null;
  const refreshOwners = new Map();
  const checkCommitOwnership = () => {
    try { commitOwnership?.(); }
    catch (error) { commitOwnershipFailure = error; throw error; }
  };
  return {
    setAuthOwnership(guards) {
      captureOwnership = guards.captureOwnership;
      assertOwnership = guards.assertOwnership;
    },
    async commit(saveSession, { assertOwnership } = {}) {
      if (committing) throw new Error('Sign in is already finishing.');
      committing = true;
      commitOwnership = assertOwnership;
      commitOwnershipFailure = null;
      try {
        checkCommitOwnership();
        const result = await saveSession();
        // Supabase wraps fetch failures; retain the identity error contract.
        if (commitOwnershipFailure) throw commitOwnershipFailure;
        return result;
      } catch (error) {
        throw commitOwnershipFailure || error;
      } finally {
        committing = false;
        commitOwnership = null;
        commitOwnershipFailure = null;
      }
    },
    async fetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      const passwordRequest = /\/auth\/v1\/token(?:\?|$)/.test(url) && /[?&]grant_type=password(?:&|$)/.test(url);
      const refreshRequest = /\/auth\/v1\/token(?:\?|$)/.test(url) && /[?&]grant_type=refresh_token(?:&|$)/.test(url);
      const commitVerification = committing && /\/auth\/v1\/user(?:\?|$)/.test(url);
      if (!passwordRequest && !refreshRequest && !commitVerification) return fetchImpl(input, init);
      let refreshKey = null;
      if (refreshRequest) {
        try { refreshKey = JSON.parse(init.body)?.refresh_token || null; } catch { /* Provider owns invalid bodies. */ }
        if (refreshKey && !refreshOwners.has(refreshKey)) {
          refreshOwners.set(refreshKey, captureOwnership?.());
          // The shared SDK serializes refreshes. Keep a bounded set of failed
          // token owners so its retries cannot adopt a later account.
          if (refreshOwners.size > 16) refreshOwners.delete(refreshOwners.keys().next().value);
        }
      }
      const refreshOwnership = refreshKey ? refreshOwners.get(refreshKey) : refreshRequest ? captureOwnership?.() : null;
      return boundedLoginRequest(async signal => {
          if (refreshRequest) assertOwnership?.(refreshOwnership);
          if (commitVerification) checkCommitOwnership();
          const response = await fetchImpl(input, { ...init, signal });
          // Do not expose headers to the SDK until the body arrives within the
          // deadline. Otherwise it could persist a late session after dismissal.
          const bytes = await response.arrayBuffer();
          if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
          if (refreshRequest) assertOwnership?.(refreshOwnership);
          if (commitVerification) checkCommitOwnership();
          if (refreshKey && response.ok) refreshOwners.delete(refreshKey);
          return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
        }, { signal: init.signal, timeoutMs, timeoutMessage: refreshRequest
          ? 'Session recovery timed out. Check your connection and try again.'
          : 'Sign in timed out. Check your connection and try again.' });
    },
  };
}

export const loginTransport = createLoginTransport((...args) => globalThis.fetch(...args));

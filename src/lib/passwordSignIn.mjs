import { boundedRequest } from './boundedRequest.mjs';

// Provisional authentication never shares storage or subscribers with Root.
// Cancellation is allowed until the explicit shared-session commit begins.
export function hasFreshPasswordSession(session, now = Date.now()) {
  try {
    const encoded = session?.access_token?.split('.')[1];
    const { exp } = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    return Number.isFinite(exp) && exp > now / 1000 + 60;
  } catch { return false; }
}

export function createPasswordSignIn({ createProvisional, prepareCommit, commitSession, timeoutMs = 15000, now = Date.now }) {
  return async (email, password, { signal, onCommit } = {}) => {
    let provisional;
    try {
      const result = await boundedRequest(async requestSignal => {
        provisional = createProvisional(requestSignal);
        const response = await provisional.auth.signInWithPassword({ email: email.trim(), password });
        if (!response.error && response.data?.session) {
          if (!hasFreshPasswordSession(response.data.session, now())) {
            throw new Error('Sign in could not finish safely. Please try again.');
          }
          // Shared startup may be recovering an older stored session. Wait
          // while dismissal is still safe; never race the shared session write.
          await prepareCommit?.();
        }
        return response;
      }, { signal, timeoutMs, timeoutMessage: 'Sign in timed out. Check your connection and try again.' });
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      if (result.error) throw result.error;
      if (!result.data?.session) return result.data;
      if (!hasFreshPasswordSession(result.data.session, now())) {
        throw new Error('Sign in could not finish safely. Please try again.');
      }
      onCommit?.();
      // UI dismissal is disabled during the official shared-session commit.
      const committed = await commitSession(result.data.session);
      if (committed.error) throw committed.error;
      return committed.data;
    } finally {
      await provisional?.auth.stopAutoRefresh();
    }
  };
}

import { boundedLoginRequest } from './loginTransport.mjs';

export function hasFreshPasswordSession(session, now = Date.now()) {
  try {
    const encoded = session?.access_token?.split('.')[1];
    const { exp } = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    return Number.isFinite(exp) && exp > now / 1000 + 60;
  } catch { return false; }
}

// Password authentication uses an isolated SDK without persistence or Root
// subscribers. Cancellation stays safe until the explicit shared commit.
export function createPasswordSignIn({ createProvisional, prepareCommit, commitSession,
  captureOwnership, assertOwnership, timeoutMs = 15000, now = Date.now }) {
  return async (email, password, { signal, onCommit } = {}) => {
    let provisional;
    const ownership = captureOwnership?.();
    try {
      const result = await boundedLoginRequest(async requestSignal => {
        provisional = createProvisional(requestSignal);
        const response = await provisional.auth.signInWithPassword({ email: email.trim(), password });
        if (!response.error && response.data?.session) {
          if (requestSignal.aborted) throw new DOMException('Request cancelled', 'AbortError');
          assertOwnership?.(ownership);
          if (!hasFreshPasswordSession(response.data.session, now())) {
            throw new Error('Sign in could not finish safely. Please try again.');
          }
          // Shared initialization may still be recovering a stored session.
          // Dismissal remains safe while waiting for it to finish.
          await prepareCommit?.();
        }
        return response;
      }, { signal, timeoutMs });
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      assertOwnership?.(ownership);
      if (result.error) throw result.error;
      if (!result.data?.session) return result.data;
      if (!hasFreshPasswordSession(result.data.session, now())) {
        throw new Error('Sign in could not finish safely. Please try again.');
      }
      onCommit?.();
      // The UI holds dismissal during this shared SDK write.
      const committed = await commitSession(result.data.session);
      if (committed.error) throw committed.error;
      return committed.data;
    } finally {
      void Promise.resolve(provisional?.auth.stopAutoRefresh()).catch(() => {});
    }
  };
}

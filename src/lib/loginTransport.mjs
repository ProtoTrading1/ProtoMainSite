import { boundedRequest } from './boundedRequest.mjs';

export function createLoginTransport(fetchImpl) {
  let attemptSignal = null;
  return {
    async run(signIn, signal) {
      // Password attempts are serialized; a cancelled predecessor must finish
      // before the provider can dispatch another password request.
      if (attemptSignal) throw new Error('Please wait for the previous sign-in attempt to finish.');
      const ownedSignal = signal || new AbortController().signal;
      attemptSignal = ownedSignal;
      try {
        if (ownedSignal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        const result = await signIn();
        if (ownedSignal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        return result;
      } finally {
        if (attemptSignal === ownedSignal) attemptSignal = null;
      }
    },
    async fetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      // Other Supabase requests keep their existing behavior and timeout rules.
      if (!/\/auth\/v1\/token(?:\?|$)/.test(url) || !/[?&]grant_type=password(?:&|$)/.test(url)) {
        return fetchImpl(input, init);
      }
      const callerSignal = attemptSignal || init.signal;
      return boundedRequest(async (signal) => {
        const response = await fetchImpl(input, { ...init, signal });
        // Consume the body inside the deadline before the SDK sees a success
        // and persists its session. Cancel/late responses cannot sign in later.
        const bytes = await response.arrayBuffer();
        return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
      }, { signal: callerSignal, timeoutMessage: 'Sign in timed out. Check your connection and try again.' });
    },
  };
}

export const loginTransport = createLoginTransport((...args) => globalThis.fetch(...args));

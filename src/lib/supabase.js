import { createClient } from '@supabase/supabase-js';
import { signInCommitTransport } from './signInRequest.mjs';
import { assertAuthIdentity, captureAuthIdentity } from './authHeaders';

// These callbacks read identity only when the asynchronous SDK transport runs.
signInCommitTransport.setAuthOwnership({
  captureOwnership: () => captureAuthIdentity(),
  assertOwnership: identity => assertAuthIdentity(identity),
});

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    global: { fetch: (...args) => signInCommitTransport.fetch(...args) },
    auth: {
      // Sessions are kept in localStorage and the access token is refreshed in
      // the background, so a page refresh — or closing the browser and coming
      // back — does not sign the customer out. How long a sign-in stays valid
      // is capped at 30 days by SESSION_MAX_AGE_DAYS in ./sessionPolicy.js.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

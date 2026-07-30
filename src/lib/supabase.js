import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
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

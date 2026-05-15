import { createClient } from '@supabase/supabase-js';

export const supabaseStock = createClient(
  import.meta.env.VITE_STOCK_SUPABASE_URL,
  import.meta.env.VITE_STOCK_SUPABASE_KEY
);

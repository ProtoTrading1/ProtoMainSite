/**
 * Pushes live price + stock from public.products onto the storefront catalogue
 * (public.website_stock) by calling the public.sync_website_from_products() RPC.
 *
 * Run AFTER the Bladerunner sync finishes writing public.products:
 *   node scripts/sync-website-from-products.mjs
 *
 * Source of truth is public.products (never written here). Join key is
 * products.sku = website_stock.barcode. See migrations/016_sync_website_from_products.sql.
 *
 * Uses the stock project's service-role key (VITE_STOCK_SUPABASE_KEY), which is
 * required because the RPC is granted to service_role only. Exits non-zero on
 * failure so the caller can detect a failed sync.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');

let envVars = {};
try {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  envVars = Object.fromEntries(
    raw.split('\n').filter((l) => l.includes('=')).map((l) => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
  );
} catch { /* fall back to process.env */ }

const SUPABASE_URL = process.env.VITE_STOCK_SUPABASE_URL || envVars.VITE_STOCK_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_STOCK_SUPABASE_KEY || envVars.VITE_STOCK_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_STOCK_SUPABASE_URL / VITE_STOCK_SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await supabase.rpc('sync_website_from_products');
  if (error) {
    console.error('sync_website_from_products failed:', error.message);
    process.exit(1);
  }
  console.log('Website catalogue synced from products:', JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Unexpected sync error:', err?.message || err);
  process.exit(1);
});

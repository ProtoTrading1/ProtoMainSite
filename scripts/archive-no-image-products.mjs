/**
 * Archive every live website_stock row with no product images.
 *
 * Uses the stock Supabase archive_product() RPC (archived_by = 'admin-bulk').
 *
 *   node scripts/archive-no-image-products.mjs           # dry-run (default)
 *   node scripts/archive-no-image-products.mjs --execute # archive for real
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
    }),
  );
} catch { /* process.env only */ }

const SUPABASE_URL = process.env.VITE_STOCK_SUPABASE_URL || envVars.VITE_STOCK_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_STOCK_SUPABASE_KEY || envVars.VITE_STOCK_SUPABASE_KEY;
const EXECUTE = process.argv.includes('--execute');
const ARCHIVED_BY = 'admin-bulk';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_STOCK_SUPABASE_URL / VITE_STOCK_SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PAGE_SIZE = 1000;

export function rowHasImage(row) {
  return [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four]
    .some((url) => String(url || '').trim());
}

async function fetchAllLive() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('website_stock')
      .select('sku, barcode, title, category, image_url_one, image_url_two, image_url_three, image_url_four')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const live = await fetchAllLive();
  const targets = live.filter((row) => !rowHasImage(row));

  console.log(`Live products: ${live.length}`);
  console.log(`No image:      ${targets.length}`);
  if (!targets.length) return;

  for (const row of targets) {
    console.log(`  ${row.sku}  ${row.barcode || ''}  ${row.title || ''}`.trim());
  }

  if (!EXECUTE) {
    console.log('\nDry run — pass --execute to archive these rows.');
    return;
  }

  let archived = 0;
  const failures = [];

  for (const row of targets) {
    const { error } = await supabase.rpc('archive_product', { p_sku: row.sku, p_by: ARCHIVED_BY });
    if (error) {
      failures.push({ sku: row.sku, error: error.message });
      continue;
    }
    archived += 1;
  }

  console.log(`\nArchived: ${archived}`);
  if (failures.length) {
    console.error('Failures:');
    for (const f of failures) console.error(`  ${f.sku}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

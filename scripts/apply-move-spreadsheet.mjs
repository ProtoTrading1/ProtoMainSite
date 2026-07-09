/**
 * Apply a Move N.xlsx recategorisation to website_stock (+ archived_products).
 *
 * Usage:
 *   node scripts/apply-move-spreadsheet.mjs scripts/data/Move_4_fashion_accessories.xlsx
 *
 * Requires VITE_STOCK_SUPABASE_URL + VITE_STOCK_SUPABASE_KEY in .env.local or env.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadMoveRows, summarizeMoveRows } from './lib/move-spreadsheet.mjs';

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
} catch { /* use process.env */ }

const SUPABASE_URL = process.env.VITE_STOCK_SUPABASE_URL || envVars.VITE_STOCK_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_STOCK_SUPABASE_KEY || envVars.VITE_STOCK_SUPABASE_KEY;

const BATCH = 100;

async function applyTable(supabase, table, rows) {
  let updated = 0;
  let missing = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const row of batch) {
      const patch = {
        category: row.category,
        subcategory_one: row.subcategory_one,
        subcategory_two: row.subcategory_two,
        subcategory_three: row.subcategory_three,
        subcategory_four: row.subcategory_four,
        subcategory_extra: row.subcategory_extra ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from(table)
        .update(patch)
        .eq('sku', row.sku)
        .select('sku');
      if (error) throw new Error(`${table} update failed for ${row.sku}: ${error.message}`);
      if (data?.length) updated += data.length;
      else missing += 1;
    }
  }

  return { updated, missing };
}

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: node scripts/apply-move-spreadsheet.mjs <path-to-move.xlsx>');
    process.exit(1);
  }

  const rows = loadMoveRows(xlsxPath);
  console.log(`Loaded ${rows.length} SKU(s) from ${xlsxPath}`);
  console.log('Target paths:');
  for (const [path, count] of Object.entries(summarizeMoveRows(rows)).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}\t${path}`);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('\nMissing VITE_STOCK_SUPABASE_URL / VITE_STOCK_SUPABASE_KEY.');
    console.error('Apply migrations/027_move_4_fashion_accessories.sql in the stock Supabase SQL editor instead.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const live = await applyTable(supabase, 'website_stock', rows);
  const archived = await applyTable(supabase, 'archived_products', rows);

  console.log('\nwebsite_stock:', live);
  console.log('archived_products:', archived);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

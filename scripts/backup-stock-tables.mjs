/**
 * Phase 1 backup: dumps the full contents of the stock project's
 * `website_products` and `products` tables to /migration-backup/*.json
 * BEFORE any destructive wipe.
 *
 * Run: node scripts/backup-stock-tables.mjs
 *
 * Exits non-zero if a table cannot be fully read, so the wipe step
 * (which checks these files) can refuse to run on a partial backup.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT_DIR = join(ROOT, 'migration-backup');

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
const PAGE_SIZE = 1000;

async function exactCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

async function fetchAll(table) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function backup(table) {
  const expected = await exactCount(table);
  const rows = await fetchAll(table);
  if (rows.length !== expected) {
    throw new Error(`Partial read of "${table}": fetched ${rows.length} of ${expected} rows. Aborting.`);
  }
  const outPath = join(OUT_DIR, `${table}.json`);
  writeFileSync(outPath, JSON.stringify({ table, count: rows.length, exported_at: new Date().toISOString(), rows }, null, 2));
  console.log(`Backed up ${rows.length} rows from "${table}" -> migration-backup/${table}.json`);
  return rows.length;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const wp = await backup('website_products');
  const pr = await backup('products');
  writeFileSync(
    join(OUT_DIR, 'backup-manifest.json'),
    JSON.stringify({ created_at: new Date().toISOString(), website_products: wp, products: pr }, null, 2)
  );
  console.log('Backup complete. Manifest written to migration-backup/backup-manifest.json');
}

main().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});

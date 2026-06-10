/**
 * Phase 2: import the Master sheet into website_stock (stock project).
 *
 * Run: node scripts/import-website-stock.mjs
 *
 * Validates everything BEFORE inserting, then re-verifies counts after.
 * Aborts (non-zero) on any validation failure without writing partial data.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadMasterRows, CATEGORIES, EXPECTED_COUNTS, EXPECTED_TOTAL } from './lib/master.mjs';

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

const CATEGORY_SET = new Set(CATEGORIES);
// Barcode integrity targets numeric-coercion artifacts (NOT a strict charset):
// real source barcodes may contain letters and symbols like - _ . / @ (e.g.
// WBW10, CAB40/50, ME095-@). We reject only values that look coerced by a spreadsheet.
const SCI_RE = /\d[eE][+-]?\d/;                       // scientific notation like 8.65E+09
const COMMA_RE = /,/;                                 // thousands separators like 8,659,001
const WHITESPACE_RE = /\s/;                           // grouped digits like "8 659 001"
const DATEISH_RE = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/; // pure all-digit date coercion

function fail(msg, sample) {
  console.error(`\nIMPORT ABORTED: ${msg}`);
  if (sample) console.error(sample);
  process.exit(1);
}

function main() {
  const rows = loadMasterRows();
  console.log(`Read ${rows.length} data rows from Master sheet.`);

  if (rows.length !== EXPECTED_TOTAL) {
    fail(`Expected exactly ${EXPECTED_TOTAL} rows, got ${rows.length}.`);
  }

  // Repair: a small number of master rows can have a blank Website SKU while
  // carrying a clear product code in the Barcode (and matching image filename).
  // Fill the SKU from the barcode ONLY when that value is globally unique among
  // SKUs; otherwise leave it blank so the required-field check aborts the run.
  const existingSkus = new Set(rows.filter((r) => r.sku).map((r) => r.sku));
  const repaired = [];
  for (const r of rows) {
    if (!r.sku && r.barcode && !existingSkus.has(r.barcode)) {
      r.sku = r.barcode;
      existingSkus.add(r.barcode);
      repaired.push({ sku: r.sku, title: r.title });
    }
  }
  if (repaired.length) {
    console.log(`Filled ${repaired.length} blank SKU(s) from barcode: ${JSON.stringify(repaired)}`);
  }

  // Required-field + integrity validation
  const seenSku = new Set();
  const badBarcodes = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const where = `row ${i + 2} (SKU ${r.sku ?? '?'})`; // +2: 1-based + header
    for (const f of ['sku', 'barcode', 'title', 'original_description', 'category', 'subcategory_one']) {
      if (!r[f]) fail(`Blank required field "${f}" at ${where}.`, JSON.stringify(r));
    }
    if (seenSku.has(r.sku)) fail(`Duplicate SKU "${r.sku}" at ${where}.`);
    seenSku.add(r.sku);
    if (!CATEGORY_SET.has(r.category)) fail(`Unknown category "${r.category}" at ${where}.`);

    const b = r.barcode;
    if (SCI_RE.test(b) || COMMA_RE.test(b) || WHITESPACE_RE.test(b) || DATEISH_RE.test(b)) {
      badBarcodes.push({ sku: r.sku, barcode: b });
    }
  }
  if (badBarcodes.length) {
    fail(`Barcode integrity check failed for ${badBarcodes.length} row(s) (scientific notation / thousands separators / date coercion / illegal chars).`,
      JSON.stringify(badBarcodes.slice(0, 20), null, 2));
  }
  console.log('Validation passed: required fields present, categories valid, barcodes intact as text.');

  // Per-category preview
  const counts = {};
  for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1;
  for (const cat of CATEGORIES) {
    if ((counts[cat] || 0) !== EXPECTED_COUNTS[cat]) {
      fail(`Pre-insert category count mismatch for "${cat}": got ${counts[cat] || 0}, expected ${EXPECTED_COUNTS[cat]}.`);
    }
  }
  console.log('Per-category counts match expected totals.');

  insert(rows);
}

async function insert(rows) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      sku: r.sku,
      barcode: r.barcode,
      title: r.title,
      original_description: r.original_description,
      image_url_one: r.image_url_one,
      image_url_two: r.image_url_two,
      category: r.category,
      subcategory_one: r.subcategory_one,
      subcategory_two: r.subcategory_two,
      subcategory_three: r.subcategory_three,
      subcategory_four: r.subcategory_four,
    }));
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const { error } = await supabase.from('website_stock').insert(batch);
        if (error) throw new Error(error.message);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, attempt * 750));
      }
    }
    if (lastErr) {
      console.error(`\nInsert failed at batch starting ${i} after retries:`, lastErr.message);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${rows.length}`);
  }
  process.stdout.write('\n');

  // Post-insert verification
  const { count, error: cErr } = await supabase.from('website_stock').select('*', { count: 'exact', head: true });
  if (cErr) { console.error('Count check failed:', cErr.message); process.exit(1); }
  if (count !== EXPECTED_TOTAL) { console.error(`Post-insert count ${count} != ${EXPECTED_TOTAL}`); process.exit(1); }
  console.log(`Verified website_stock count = ${count}.`);
  console.log('Import complete.');
}

main();

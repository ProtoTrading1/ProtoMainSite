/**
 * Phase 3: rehost product images to Supabase Storage (stock project).
 *
 * Run: node scripts/migrate-product-images.mjs
 *
 * - Source URLs come from the Master workbook (so failed rows can be retried
 *   even after their DB column was set to NULL).
 * - Resumable: skips slots whose DB value already points at the bucket.
 * - Content-validated: Content-Type image/* AND magic-byte sniff. A 200 that
 *   returns HTML / a non-image is rejected to the failure report, never rehosted.
 * - Failures are logged to migration-backup/failed_images.json and the column is
 *   left NULL; one bad image never aborts the run.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadMasterRows } from './lib/master.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const BUCKET = 'product-images';
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;

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

const BUCKET_MARKER = `/storage/v1/object/public/${BUCKET}/`;

function sniff(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return { type: 'image/gif', ext: 'gif' };
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return { type: 'image/webp', ext: 'webp' };
  return null;
}

function safeSku(sku) {
  return String(sku).replace(/[^A-Za-z0-9._-]/g, '_');
}

async function downloadImage(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ProtoPortal-image-migration/1.0 (+catalogue rebuild)' },
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        if (res.status === 404) return { error: '404' };
        throw new Error(lastErr);
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const buf = Buffer.from(await res.arrayBuffer());
      const magic = sniff(buf);
      if (!magic) return { error: `not-an-image (content-type: ${ct || 'none'})` };
      if (ct && !ct.startsWith('image/')) return { error: `bad-content-type (${ct})` };
      return { buf, type: magic.type, ext: magic.ext };
    } catch (e) {
      clearTimeout(t);
      lastErr = e.name === 'AbortError' ? 'timeout' : e.message;
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  return { error: lastErr || 'fetch-failed' };
}

async function processSlot(sku, slot, url, currentDbValue, failures) {
  if (!url) return { changed: false };
  if (currentDbValue && currentDbValue.includes(BUCKET_MARKER)) return { changed: false }; // resume

  const dl = await downloadImage(url);
  if (dl.error) {
    failures.push({ sku, slot, url, reason: dl.error });
    return { changed: true, value: null };
  }
  const key = `${safeSku(sku)}/${slot}.${dl.ext}`;
  const up = await supabase.storage.from(BUCKET).upload(key, dl.buf, { contentType: dl.type, upsert: true });
  if (up.error) {
    failures.push({ sku, slot, url, reason: `upload-failed: ${up.error.message}` });
    return { changed: true, value: null };
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return { changed: true, value: data.publicUrl };
}

async function main() {
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  // Original source URLs from master, keyed by the SKU we imported.
  const master = loadMasterRows();
  const origBySku = new Map();
  for (const r of master) {
    const sku = r.sku || r.barcode; // mirror the import's blank-SKU repair
    origBySku.set(sku, { one: r.image_url_one, two: r.image_url_two });
  }

  // Current DB state.
  const dbRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('website_stock')
      .select('sku, image_url_one, image_url_two')
      .range(from, from + 999);
    if (error) throw error;
    dbRows.push(...(data || []));
    if ((data || []).length < 1000) break;
    from += 1000;
  }

  const failures = [];
  let processed = 0;
  let uploaded = 0;
  const queue = [...dbRows];

  async function worker() {
    while (queue.length) {
      const row = queue.pop();
      const orig = origBySku.get(row.sku) || {};
      const patch = {};
      const s1 = await processSlot(row.sku, 1, orig.one, row.image_url_one, failures);
      if (s1.changed) { patch.image_url_one = s1.value; if (s1.value) uploaded++; }
      const s2 = await processSlot(row.sku, 2, orig.two, row.image_url_two, failures);
      if (s2.changed) { patch.image_url_two = s2.value; if (s2.value) uploaded++; }
      if (Object.keys(patch).length) {
        const { error } = await supabase.from('website_stock').update(patch).eq('sku', row.sku);
        if (error) failures.push({ sku: row.sku, slot: 0, url: '(db update)', reason: error.message });
      }
      processed++;
      if (processed % 100 === 0) process.stdout.write(`\rProcessed ${processed}/${dbRows.length} · uploaded ${uploaded} · failures ${failures.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');

  writeFileSync(
    join(ROOT, 'migration-backup', 'failed_images.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), count: failures.length, failures }, null, 2)
  );
  console.log(`Done. Rehosted ${uploaded} images. ${failures.length} failure(s) -> migration-backup/failed_images.json`);
}

main().catch((err) => {
  console.error('\nImage migration failed:', err.message);
  process.exit(1);
});

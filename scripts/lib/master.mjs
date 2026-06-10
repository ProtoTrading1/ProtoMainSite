/**
 * Shared parsing for Categorised_Product_Master.xlsx.
 * Used by import, image migration, and taxonomy generation so they can never
 * disagree about columns, categories, or slugs.
 */
import xlsx from 'xlsx';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { utils, readFile } = xlsx;
const __dir = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MASTER_PATH =
  process.env.MASTER_XLSX || join(__dir, '../../migration-backup/Categorised_Product_Master.xlsx');

// Exact header strings expected in the Master sheet (resolved by NAME, not position).
export const MASTER_HEADERS = [
  'Website SKU',
  'Barcode',
  'Description',
  'Original Description',
  'Image URL One',
  'Image URL Two',
  'Subcategory One',
  'Subcategory Two',
  'Subcategory Three',
  'Subcategory Four',
  'Category',
];

// The 12 canonical main categories (exact strings).
export const CATEGORIES = [
  'Arts, Crafts & Stationery',
  'Beads, Jewellery & Accessories',
  'Beauty & Personal Care',
  'Events & Parties',
  'Fashion & Accessories',
  'Food & Drinks',
  'Hardware',
  'Homeware & Kitchen',
  'Motarro',
  'Packaging',
  'Textiles',
  'Toys, Games & Kids',
];

export const EXPECTED_COUNTS = {
  'Beads, Jewellery & Accessories': 2112,
  'Motarro': 591,
  'Textiles': 560,
  'Fashion & Accessories': 505,
  'Beauty & Personal Care': 445,
  'Packaging': 345,
  'Arts, Crafts & Stationery': 252,
  'Toys, Games & Kids': 129,
  'Hardware': 128,
  'Homeware & Kitchen': 113,
  'Food & Drinks': 44,
  'Events & Parties': 18,
};

export const EXPECTED_TOTAL = 5242;

/** Deterministic, collision-aware slug. Used for every category + subcategory. */
export function labelToSlug(label) {
  if (label === null || label === undefined) return '';
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function loadWorkbook(path = DEFAULT_MASTER_PATH) {
  readFileSync(path); // throws a clear error if the file is missing
  return readFile(path, { cellDates: false, cellNF: false, cellText: false });
}

/**
 * Reads the Master sheet into normalised objects. Empty cells become null.
 * Resolves columns by header name and fails loudly if a header is missing.
 */
export function loadMasterRows(path = DEFAULT_MASTER_PATH) {
  const wb = loadWorkbook(path);
  const ws = wb.Sheets['Master'];
  if (!ws) throw new Error('Master sheet not found in workbook');

  // raw:false => formatted strings, so barcodes keep leading zeros / letters.
  const grid = utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
  const header = (grid[0] || []).map((h) => (h === null || h === undefined ? '' : String(h).trim()));

  const idx = {};
  for (const name of MASTER_HEADERS) {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Master header missing: "${name}". Found: ${JSON.stringify(header)}`);
    idx[name] = i;
  }

  const rows = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const isBlank = MASTER_HEADERS.every((name) => clean(row[idx[name]]) === null);
    if (isBlank) continue;
    rows.push({
      sku: clean(row[idx['Website SKU']]),
      barcode: clean(row[idx['Barcode']]),
      title: clean(row[idx['Description']]),
      original_description: clean(row[idx['Original Description']]),
      image_url_one: clean(row[idx['Image URL One']]),
      image_url_two: clean(row[idx['Image URL Two']]),
      subcategory_one: clean(row[idx['Subcategory One']]),
      subcategory_two: clean(row[idx['Subcategory Two']]),
      subcategory_three: clean(row[idx['Subcategory Three']]),
      subcategory_four: clean(row[idx['Subcategory Four']]),
      category: clean(row[idx['Category']]),
    });
  }
  return rows;
}

export { utils as xlsxUtils };

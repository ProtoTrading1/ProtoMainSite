/**
 * Parse category-move workbooks (Move N.xlsx) into canonical website_stock taxonomy
 * labels validated against src/data/categories.json.
 */
import xlsx from 'xlsx';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { readFile, utils } = xlsx;

const __dir = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_PATH = join(__dir, '../../src/data/categories.json');

const LABEL_ALIASES = {
  fashionaccessories: 'Fashion & Accessories',
  packagingstorage: 'Packaging & Storage',
  scarves: 'Scarves',
  syntheticbagsbags: 'Synthetic Bags',
  handbags: 'Handbags',
  leather: 'Leather',
  walletspurses: 'Wallets & Purses',
  bagstraps: 'Bag Straps',
  smallaccessories: 'Small Accessories',
  irononpatch: 'Iron-On Patch',
  mensslingcrossbody: "Men's Sling & Crossbody",
  slingcrossbody: 'Sling & Crossbody',
  hatscaps: 'Hats & Caps',
  sunhats: 'Sunhats',
  hairaccessories: 'Hair Accessories',
  backpackshoulderbags: 'Backpack & Shoulder',
  luggagelaptop: 'Luggage & Laptop',
  fedora: 'Fedora',
  panama: 'Panama',
  packagingpacketsandbags: 'Packaging Packets and Bags',
  paperbags: 'Paper Bags',
  boutique: 'Boutique',
};

export function normKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function canonLabel(value) {
  const key = normKey(value);
  return LABEL_ALIASES[key] || String(value ?? '').trim();
}

function walkPaths(nodes, prefix = []) {
  const out = [];
  for (const node of nodes || []) {
    const path = [...prefix, node.label];
    out.push(path);
    if (node.children?.length) out.push(...walkPaths(node.children, path));
  }
  return out;
}

function loadTaxonomyPaths() {
  const tree = JSON.parse(readFileSync(TAXONOMY_PATH, 'utf8'));
  const paths = walkPaths(tree);
  const set = new Set(paths.map((p) => p.join('\0')));
  return { tree, paths, set };
}

function inferExtraSubcategory(productName, pathLabels) {
  const upper = String(productName ?? '').toUpperCase();
  const parts = [...pathLabels];
  if (parts.length === 3 && parts[2] === 'Paper Bags' && upper.includes('BOUTIQUE')) {
    parts.push('Boutique');
  }
  return parts;
}

function pathToRow(pathLabels) {
  const [category, subcategory_one, subcategory_two = null, subcategory_three = null, subcategory_four = null] = pathLabels;
  return {
    category,
    subcategory_one,
    subcategory_two,
    subcategory_three,
    subcategory_four,
    path: pathLabels,
  };
}

/**
 * @param {string} xlsxPath
 * @param {{ sheet?: string, action?: string }} [opts]
 */
export function loadMoveRows(xlsxPath, opts = {}) {
  const sheetName = opts.sheet || 'Sheet1';
  const requiredAction = (opts.action || 'move to final').trim().toLowerCase();

  readFileSync(xlsxPath);
  const wb = readFile(xlsxPath, { cellDates: false, cellNF: false, cellText: false });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in ${xlsxPath}`);

  const grid = utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
  const header = (grid[0] || []).map((h) => String(h ?? '').trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Column "${name}" missing. Found: ${JSON.stringify(header)}`);
    return i;
  };

  const iSku = col('SKU');
  const iName = col('ProductName');
  const iAction = col('Recommended Action');
  const iMain = col('Final Main Menu');
  const iKid1 = col('Final Kid 1');
  const iKid2 = col('Final Kid 2');

  const { set: pathSet } = loadTaxonomyPaths();
  const rows = [];
  const unresolved = [];

  for (let r = 1; r < grid.length; r += 1) {
    const row = grid[r] || [];
    const sku = String(row[iSku] ?? '').trim();
    if (!sku) continue;

    const action = String(row[iAction] ?? '').trim().toLowerCase();
    if (requiredAction && action !== requiredAction) continue;

    const rawParts = [row[iMain], row[iKid1], row[iKid2]].filter(Boolean);
    const pathLabels = inferExtraSubcategory(row[iName], rawParts.map(canonLabel));
    const key = pathLabels.join('\0');
    if (!pathSet.has(key)) {
      unresolved.push({ sku, pathLabels });
      continue;
    }

    rows.push({ sku, productName: row[iName], ...pathToRow(pathLabels) });
  }

  if (unresolved.length) {
    const sample = unresolved.slice(0, 5).map((u) => `${u.sku}: ${u.pathLabels.join(' > ')}`).join('; ');
    throw new Error(`${unresolved.length} SKU(s) could not be mapped to taxonomy paths. Sample: ${sample}`);
  }

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.sku)) throw new Error(`Duplicate SKU in workbook: ${row.sku}`);
    seen.add(row.sku);
  }

  return rows;
}

export function summarizeMoveRows(rows) {
  const counts = {};
  for (const row of rows) {
    const key = row.path.join(' > ');
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

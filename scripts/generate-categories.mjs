/**
 * Phase 4a: regenerate src/data/categories.json from the Master workbook.
 *
 * Builds the nested taxonomy Category -> Subcategory One..Four from the Master
 * sheet, enriched with L1 + L2 descriptions from each category's own sheet.
 *
 * Slug-collision guard (item 6): if two DISTINCT labels under the same parent
 * slugify to the same id, the build FAILS loudly rather than silently
 * mis-routing. This guarantees labelToSlug is a safe 1:1 key, so the app + data
 * layer can derive ids by slugifying labels without a separate lookup table.
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadMasterRows, loadWorkbook, labelToSlug, CATEGORIES, xlsxUtils } from './lib/master.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../src/data/categories.json');

// Icon keys must exist in src/lib/navConfig.js LUCIDE_ICON_MAP.
const CATEGORY_ICONS = {
  'Arts, Crafts & Stationery': 'PenTool',
  'Beads, Jewellery & Accessories': 'Scissors',
  'Beauty & Personal Care': 'Smile',
  'Events & Parties': 'Gift',
  'Fashion & Accessories': 'Shirt',
  'Food & Drinks': 'Cookie',
  'Hardware': 'Wrench',
  'Homeware & Kitchen': 'Home',
  'Motarro': 'Gem',
  'Packaging': 'Package',
  'Textiles': 'Wind',
  'Toys, Games & Kids': 'ToyBrick',
};

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Parse a category sheet: L1 description (row 1) + map of Subcategory One -> description. */
function parseCategorySheet(wb, categoryLabel) {
  const ws = wb.Sheets[categoryLabel];
  if (!ws) return { description: null, subDescriptions: {} };
  const grid = xlsxUtils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
  const description = clean(grid[1]?.[0]);
  const subDescriptions = {};
  let headerRow = -1;
  for (let i = 0; i < grid.length; i++) {
    if (clean(grid[i]?.[0]) === 'Subcategory') { headerRow = i; break; }
  }
  if (headerRow !== -1) {
    for (let i = headerRow + 1; i < grid.length; i++) {
      const label = clean(grid[i]?.[0]);
      if (!label || label === 'Total') break;
      subDescriptions[label] = clean(grid[i]?.[1]);
    }
  }
  return { description, subDescriptions };
}

/**
 * Insert a label as a child of `parent.children`, with collision detection.
 * Returns the (existing or new) child node.
 */
function upsertChild(parent, label, slugIndex, pathLabels) {
  const slug = labelToSlug(label);
  if (!slug) throw new Error(`Empty slug for label "${label}" at path ${pathLabels.join(' > ')}`);
  const existing = parent.children.find((c) => c.id === slug);
  if (existing) {
    if (existing.label !== label) {
      throw new Error(
        `SLUG COLLISION under "${pathLabels.join(' > ') || '(root)'}": ` +
        `"${existing.label}" and "${label}" both slugify to "${slug}".`
      );
    }
    return existing;
  }
  const node = { id: slug, label, children: [] };
  parent.children.push(node);
  slugIndex.add(slug);
  return node;
}

function main() {
  const rows = loadMasterRows();
  const wb = loadWorkbook();

  const root = { children: [] };

  // Seed L1 in canonical order so the nav order is stable + predictable.
  for (const cat of CATEGORIES) {
    const { description, subDescriptions } = parseCategorySheet(wb, cat);
    const node = upsertChild(root, cat, new Set(), []);
    node.icon = CATEGORY_ICONS[cat] || 'Package';
    if (description) node.description = description;
    node._subDescriptions = subDescriptions; // temp, stripped before write
  }

  // Walk every product row and build the deeper levels.
  for (const r of rows) {
    const l1 = root.children.find((c) => c.label === r.category);
    if (!l1) throw new Error(`Category "${r.category}" missing from canonical list`);
    const levels = [r.subcategory_one, r.subcategory_two, r.subcategory_three, r.subcategory_four].filter(Boolean);
    let parent = l1;
    const pathLabels = [r.category];
    for (let depth = 0; depth < levels.length; depth++) {
      const label = levels[depth];
      const child = upsertChild(parent, label, new Set(), pathLabels);
      // Attach L2 description from the sheet map (only first subcategory level has one).
      if (depth === 0 && l1._subDescriptions && l1._subDescriptions[label] && !child.description) {
        child.description = l1._subDescriptions[label];
      }
      pathLabels.push(label);
      parent = child;
    }
  }

  // Sort children alphabetically at every level below L1 (L1 stays canonical order),
  // and strip temp fields.
  function finalize(node, isRoot) {
    if (!isRoot && node.children) {
      node.children.sort((a, b) => a.label.localeCompare(b.label));
    }
    delete node._subDescriptions;
    for (const c of node.children || []) finalize(c, false);
  }
  finalize(root, true);

  writeFileSync(OUT, JSON.stringify(root.children, null, 2) + '\n');

  // Summary
  const countNodes = (nodes) => nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0);
  console.log(`Wrote ${root.children.length} categories, ${countNodes(root.children)} total nodes -> src/data/categories.json`);
}

main();

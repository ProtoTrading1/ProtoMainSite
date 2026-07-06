/**
 * Mottaro brand line — virtual second category tree + path mapping.
 *
 * SHARED MODULE: this file is duplicated byte-for-byte in
 * protoportal-admin/lib/mottaro-category.mjs and
 * Proto-Website-/lib/mottaro-category.mjs. Both repos pin its hash in their
 * qa-smoke-check.mjs — edit both copies together and update the pinned hash,
 * or the smoke checks fail.
 */

const MOTARRO_RE = /\b(?:MOTARRO|MOTTARO|MONTTARO)\b/i;

export function isMotarroProduct(row) {
  return MOTARRO_RE.test(String(row?.title || row?.name || ''));
}

function normLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function findNodeByLabel(nodes, label) {
  const target = normLabel(label);
  return (nodes || []).find((n) => normLabel(n.label) === target) || null;
}

/** Deep-clone a taxonomy subtree with mottaro- id prefix on every node. */
export function prefixSubtree(node, prefix = 'mottaro-') {
  const id = node.id.startsWith(prefix) ? node.id : `${prefix}${node.id}`;
  return {
    id,
    label: node.label,
    children: (node.children || []).map((c) => prefixSubtree(c, prefix)),
  };
}

function hasLabelInTree(node, label) {
  if (normLabel(node.label) === normLabel(label)) return true;
  return (node.children || []).some((c) => hasLabelInTree(c, label));
}

/** Build the Mottaro branch from the main taxonomy tree. */
export function buildMotarroBranch(tree) {
  const arts = (tree || []).find((c) => c.id === 'arts-and-crafts');
  const stationery = (tree || []).find((c) => c.id === 'stationery');
  const artSupplies = arts?.children?.find((c) => c.id === 'art-supplies');
  const crafts = arts?.children?.find((c) => c.id === 'crafts');
  const schoolOffice = stationery?.children?.find((c) => c.id === 'school-office');
  const educational = stationery?.children?.find((c) => c.id === 'educational');

  const artSuppliesBranch = artSupplies
    ? prefixSubtree(artSupplies)
    : { id: 'mottaro-art-supplies', label: 'Art Supplies', children: [] };

  // DB rows use "Painting Palettes" — not always in the main art-supplies tree.
  if (!hasLabelInTree(artSuppliesBranch, 'Painting Palettes')) {
    artSuppliesBranch.children.push({
      id: 'mottaro-painting-palettes',
      label: 'Painting Palettes',
      children: [],
    });
  }

  return {
    id: 'mottaro',
    label: 'Mottaro',
    children: [
      artSuppliesBranch,
      crafts ? prefixSubtree(crafts) : { id: 'mottaro-crafts', label: 'Crafts', children: [] },
      schoolOffice ? prefixSubtree(schoolOffice) : { id: 'mottaro-school-office', label: 'School & Office', children: [] },
      educational ? prefixSubtree(educational) : { id: 'mottaro-educational', label: 'Educational', children: [] },
      {
        id: 'mottaro-other',
        label: 'Other',
        children: [
          { id: 'mottaro-other-beads', label: 'Beads & Jewellery', children: [] },
          { id: 'mottaro-other-fashion', label: 'Fashion & Accessories', children: [] },
          { id: 'mottaro-other-general', label: 'General', children: [] },
        ],
      },
    ],
  };
}

/** Insert or replace the Mottaro top-level category in a taxonomy tree. */
export function injectMotarroIntoTree(tree) {
  const list = Array.isArray(tree) ? tree.filter((c) => c.id !== 'mottaro') : [];
  const mottaro = buildMotarroBranch(list);
  const artsIdx = list.findIndex((c) => c.id === 'arts-and-crafts');
  const insertAt = artsIdx >= 0 ? artsIdx + 1 : 0;
  list.splice(insertAt, 0, mottaro);
  return list;
}

export function findMotarroNode(tree) {
  return (tree || []).find((c) => c.id === 'mottaro') || null;
}

/** Walk a branch by matching human labels to node ids. */
function resolvePathByLabels(branchNode, tailLabels, pathSoFar) {
  const path = [...pathSoFar];
  let node = branchNode;
  let labels = [...tailLabels];

  while (labels.length && node) {
    const head = labels[0];
    let child = findNodeByLabel(node.children || [], head);
    if (!child) {
      // Fuzzy: Painting Palettes vs Painting Tools & Accessories
      const fuzzy = (node.children || []).find((n) => {
        const l = normLabel(n.label);
        const r = normLabel(head);
        return l.includes(r) || r.includes(l);
      });
      child = fuzzy || null;
    }
    if (!child) break;
    path.push(child.id);
    node = child;
    labels = labels.slice(1);
  }
  return path;
}

function otherMotarroPath(tree, mainLabel) {
  const m = normLabel(mainLabel);
  if (m === 'beads' || m === 'jewellery' || m === 'jewelry') {
    return ['mottaro', 'mottaro-other', 'mottaro-other-beads'];
  }
  if (m === 'fashion & accessories' || m === 'fashion and accessories') {
    return ['mottaro', 'mottaro-other', 'mottaro-other-fashion'];
  }
  return ['mottaro', 'mottaro-other', 'mottaro-other-general'];
}

export const MOTTARO_GENERAL_FALLBACK_PATH = ['mottaro', 'mottaro-other', 'mottaro-other-general'];

export function isGeneralMotarroFallback(path) {
  return Array.isArray(path)
    && path.length === MOTTARO_GENERAL_FALLBACK_PATH.length
    && path.every((seg, i) => seg === MOTTARO_GENERAL_FALLBACK_PATH[i]);
}

/**
 * Serialize a derived path for the mottaro_path column. Only meaningful
 * positions are snapshotted — never the bare root or the Other›General
 * fallback, so a stale snapshot can't pin a product to a junk position.
 */
export function motarroPathSnapshot(path) {
  if (!Array.isArray(path) || path.length < 2) return null;
  if (isGeneralMotarroFallback(path)) return null;
  return JSON.stringify(path);
}

/** Parse + validate a stored mottaro_path against the current virtual tree. */
export function parseStoredMotarroPath(raw, tree) {
  if (!raw) return null;
  let ids;
  try {
    ids = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(ids) || !ids.length || ids[0] !== 'mottaro') return null;
  if (!ids.every((id) => typeof id === 'string' && id)) return null;
  let node = findMotarroNode(tree);
  if (!node) return null;
  for (let i = 1; i < ids.length; i += 1) {
    node = (node.children || []).find((c) => c.id === ids[i]);
    if (!node) return null;
  }
  return ids;
}

/**
 * Map primary category labels to a virtual Mottaro category path (node ids).
 * Returns ['mottaro'] when the labels are empty or the virtual tree is
 * unavailable; otherwise always resolves to a branch (Other›General at worst).
 */
export function deriveMotarroPathFromLabels(rawLabels, tree) {
  const labels = (rawLabels || []).filter((v) => v != null && String(v).trim());

  if (!labels.length) return ['mottaro'];

  const mottaroRoot = findMotarroNode(tree);
  if (!mottaroRoot) return ['mottaro'];

  const main = normLabel(labels[0]);

  if (main === 'arts and crafts') {
    const sub1 = normLabel(labels[1]);
    if (sub1 === 'art supplies') {
      const branch = mottaroRoot.children?.find((c) => c.id === 'mottaro-art-supplies');
      return resolvePathByLabels(branch, labels.slice(2), ['mottaro', 'mottaro-art-supplies']);
    }
    if (sub1 === 'crafts') {
      const branch = mottaroRoot.children?.find((c) => c.id === 'mottaro-crafts');
      return resolvePathByLabels(branch, labels.slice(2), ['mottaro', 'mottaro-crafts']);
    }
    return otherMotarroPath(tree, labels[0]);
  }

  if (main === 'stationery') {
    const sub1 = normLabel(labels[1]);
    if (sub1 === 'educational') {
      const branch = mottaroRoot.children?.find((c) => c.id === 'mottaro-educational');
      return resolvePathByLabels(branch, labels.slice(2), ['mottaro', 'mottaro-educational']);
    }
    const branch = mottaroRoot.children?.find((c) => c.id === 'mottaro-school-office');
  if (sub1 === 'school & office' || sub1 === 'school and office') {
      return resolvePathByLabels(branch, labels.slice(2), ['mottaro', 'mottaro-school-office']);
    }
    // Stationery without School & Office wrapper — treat remainder as school-office children
    return resolvePathByLabels(branch, labels.slice(1), ['mottaro', 'mottaro-school-office']);
  }

  return otherMotarroPath(tree, labels[0]);
}

/**
 * Resolve a product row's virtual Mottaro path.
 * Precedence: live derivation from primary labels when it fully resolves;
 * otherwise the persisted mottaro_path snapshot (validated against the
 * current tree); otherwise the Other›General fallback. This keeps Mottaro
 * placement stable when primary categories are renamed, moved or deleted.
 */
export function inferMotarroPathFromRow(row, tree) {
  if (!isMotarroProduct(row)) return [];
  const labels = [
    row.category,
    row.subcategory_one,
    row.subcategory_two,
    row.subcategory_three,
    row.subcategory_four,
  ];
  const derived = deriveMotarroPathFromLabels(labels, tree);
  if (derived.length >= 2) return derived;
  const stored = parseStoredMotarroPath(row.mottaro_path, tree);
  if (stored && stored.length >= 2) return stored;
  // Without an injected Mottaro branch keep the legacy bare-root behaviour.
  if (!findMotarroNode(tree)) return derived;
  return [...MOTTARO_GENERAL_FALLBACK_PATH];
}

/** True when a Mottaro virtual path matches a browse filter prefix. */
export function motarroPathMatchesFilter(mottaroPath, filterPath) {
  if (!Array.isArray(filterPath) || !filterPath.length) return true;
  if (!filterPath[0] || filterPath[0] === 'mottaro') {
    if (!filterPath.length || filterPath.length === 1) return mottaroPath.length > 0;
    return filterPath.every((seg, i) => mottaroPath[i] === seg);
  }
  return false;
}

export function isMotarroBrowsePath(categoryPath) {
  return Array.isArray(categoryPath) && categoryPath[0] === 'mottaro';
}

/** Enrich adapted product with multi-category metadata. */
export function enrichMotarroCategoryFields(product, row, tree, primaryPath) {
  const mottaroPath = inferMotarroPathFromRow(row, tree);
  const isMultiCategory = mottaroPath.length > 0;
  const categoryPaths = isMultiCategory
    ? [primaryPath, mottaroPath].filter((p) => p?.length)
    : [primaryPath].filter((p) => p?.length);

  return {
    ...product,
    isMultiCategory,
    alternateCategoryPath: mottaroPath,
    categoryPaths,
    brandLine: isMultiCategory ? 'Mottaro' : null,
    // Raw persisted snapshot (validated) — the portal feeds this back into
    // row-shaped objects for client-side Mottaro filtering.
    mottaroPath: parseStoredMotarroPath(row.mottaro_path, tree) || [],
  };
}

/** Filter rows when browsing the virtual Mottaro tree. */
export function filterRowsByMotarroPath(rows, categoryPath, tree) {
  if (!isMotarroBrowsePath(categoryPath)) return rows;
  return rows.filter((row) => {
    if (!isMotarroProduct(row)) return false;
    const mp = inferMotarroPathFromRow(row, tree);
    return motarroPathMatchesFilter(mp, categoryPath);
  });
}

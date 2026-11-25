/**
 * Staff-created Motarro folders — pure tree logic.
 *
 * The Motarro branch is generated from code on every read
 * (lib/mottaro-category.mjs). Folders staff add in Admin → Product Manager are
 * stored in site-config `taxonomy/mottaro-folders.json`
 * ({ folders: [{ id, parentId, label, createdAt }] }) and grafted onto the
 * generated branch AFTER it is built, under the exact parent they were created
 * under. Products reach a staff folder only through an extra placement
 * (lib/placements.mjs); their own category is never changed.
 *
 * SHARED MODULE: byte-identical in Proto_Admin/lib/mottaro-folders.mjs and
 * ProtoMainSite/lib/mottaro-folders.mjs. Both repos pin its hash in
 * scripts/qa-smoke-check.mjs and a test — edit both copies together and update
 * every pin, or the admin and the website disagree about where a folder sits.
 */

export const MOTTARO_FOLDERS_FILE = 'taxonomy/mottaro-folders.json';
export const MOTTARO_FOLDER_ID_PREFIX = 'mottaro-f-';

export function isMottaroNodeId(id) {
  return id === 'mottaro' || String(id || '').startsWith('mottaro-');
}

export function isStaffMottaroFolderId(id) {
  return String(id || '').startsWith(MOTTARO_FOLDER_ID_PREFIX);
}

/** Keep only well-formed folder records; never throws. */
export function sanitizeMottaroFolders(raw) {
  const list = Array.isArray(raw?.folders) ? raw.folders : Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const id = String(f?.id || '').trim();
    const parentId = String(f?.parentId || '').trim();
    const label = String(f?.label || '').trim();
    if (!isStaffMottaroFolderId(id) || !isMottaroNodeId(parentId) || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, parentId, label, createdAt: f?.createdAt || null });
  }
  return out;
}

function findInBranch(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;
    const hit = findInBranch(node.children, id);
    if (hit) return hit;
  }
  return null;
}

function collectIds(nodes, out = new Set()) {
  for (const node of nodes || []) {
    out.add(node.id);
    collectIds(node.children, out);
  }
  return out;
}

/**
 * Append staff folders under their parents in an already-injected tree.
 * Pure: returns a new tree, never mutates the input. Parents are resolved in
 * passes so a folder created under another staff folder lands correctly
 * regardless of list order. A folder whose parent is hidden or gone simply
 * does not show; a hidden folder hides its own staff subfolders too.
 */
export function graftMottaroFolders(tree, folders, hiddenIds = []) {
  const list = Array.isArray(tree) ? tree : [];
  const rootIdx = list.findIndex((c) => c.id === 'mottaro');
  if (rootIdx < 0 || !folders?.length) return list;
  const hidden = new Set(hiddenIds || []);
  const clone = (node) => ({ ...node, children: (node.children || []).map(clone) });
  const root = clone(list[rootIdx]);
  // Ids anywhere in the tree must never be shadowed by a staff folder.
  const existing = collectIds(list);

  let pending = sanitizeMottaroFolders(folders).filter((f) => !hidden.has(f.id) && !existing.has(f.id));
  let progressed = true;
  while (pending.length && progressed) {
    progressed = false;
    const next = [];
    for (const f of pending) {
      const parent = f.parentId === 'mottaro' ? root : findInBranch(root.children, f.parentId);
      if (!parent) { next.push(f); continue; }
      parent.children = [...(parent.children || []), { id: f.id, label: f.label, children: [], staffFolder: true }];
      existing.add(f.id);
      progressed = true;
    }
    pending = next;
  }
  const out = [...list];
  out[rootIdx] = root;
  return out;
}

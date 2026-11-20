import { injectMotarroIntoTree } from './mottaro-category.mjs';

const ID = /^[a-z0-9][a-z0-9_-]{0,159}$/;
const VIEWS = new Set(['just-added', 'specials', '__all__', '__uncategorized__', 'instore-products']);
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const norm = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
const key = path => JSON.stringify(path);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
const validLabel = value => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const validId = value => typeof value === 'string' && ID.test(value) && !VIEWS.has(value);
const exact = (v, fields) => plain(v) && Object.keys(v).sort().join(',') === [...fields].sort().join(',');

function validateTree(tree, { allowManual = false } = {}) {
  if (!Array.isArray(tree)) fail('Categories must be an array.');
  const ids = new Set(); let count = 0;
  function visit(nodes, depth) {
    if (depth > 16) fail('Category path is too deep.');
    const labels = new Set();
    for (const n of nodes) {
      if (!plain(n) || Object.keys(n).some(k => !['id', 'label', 'children', ...(allowManual ? ['manualGenerated'] : [])].includes(k))
        || !validId(n.id) || !validLabel(n.label) || !Array.isArray(n.children)
        || (own(n, 'manualGenerated') && n.manualGenerated !== true)) fail('Invalid category node.');
      if (++count > 5000 || ids.has(n.id)) fail('Category IDs must be globally unique.');
      if (labels.has(norm(n.label))) fail('A sibling category already has that name.');
      ids.add(n.id); labels.add(norm(n.label)); visit(n.children, depth + 1);
    }
  }
  visit(tree, 0); return ids;
}
function index(tree) {
  const paths = new Map(), ids = new Set();
  function walk(nodes, parent) { for (const node of nodes) { const path = [...parent, node.id]; paths.set(key(path), node); ids.add(node.id); walk(node.children || [], path); } }
  walk(tree, []); return { paths, ids };
}
export function readGeneratedTaxonomy(store, legacyHidden = []) {
  if (!own(store || {}, 'generatedTaxonomy')) return { version: 1, hiddenIds: [...new Set(legacyHidden)], nodes: [] };
  const state = store.generatedTaxonomy;
  if (!exact(state, ['version', 'hiddenIds', 'nodes']) || state.version !== 1 || !Array.isArray(state.hiddenIds)
    || state.hiddenIds.some(id => !validId(id) || id === 'mottaro') || new Set(state.hiddenIds).size !== state.hiddenIds.length
    || !Array.isArray(state.nodes) || state.nodes.length > 1000) fail('Invalid generated taxonomy document.');
  for (const entry of state.nodes) {
    if (!exact(entry, ['path', 'label', 'order']) || !Array.isArray(entry.path) || entry.path.length < 2 || entry.path.length > 16
      || !Number.isSafeInteger(entry.order) || entry.order < 0 || entry.order > 5000
      || entry.path[0] !== 'mottaro' || !entry.path.every(validId) || !validLabel(entry.label)) fail('Invalid manual generated category.');
  }
  return structuredClone(state);
}
function validateEntries(regular, state) {
  validateTree(regular);
  const canonical = injectMotarroIntoTree(structuredClone(regular));
  validateTree(canonical);
  const base = index(canonical); const paths = new Map(base.paths), ids = new Set(base.ids);
  // Parents must precede children. Lexical path order alone is not depth order.
  const entries = [...state.nodes].sort((a,b) => a.path.length - b.path.length || compare(key(a.path.slice(0,-1)), key(b.path.slice(0,-1))) || a.order - b.order || compare(key(a.path), key(b.path)));
  const positions = new Set();
  for (const entry of entries) {
    const parentKey = key(entry.path.slice(0,-1)), id = entry.path.at(-1), nodeKey = key(entry.path);
    if (!paths.has(parentKey) || ids.has(id) || paths.has(nodeKey)) fail('Manual category parent is missing or its ID is duplicated.');
    const positionKey = `${parentKey}:${entry.order}`;
    if (positions.has(positionKey)) fail('Manual sibling ordering is ambiguous.');
    positions.add(positionKey);
    const parent = paths.get(parentKey);
    if ((parent.children || []).some(n => norm(n.label) === norm(entry.label))) fail('A sibling category already has that name.');
    const node = { id, label: entry.label, children: [], manualGenerated: true };
    parent.children.splice(Math.min(entry.order, parent.children.length), 0, node); paths.set(nodeKey, node); ids.add(id);
  }
  return canonical;
}
export function materializeTaxonomy(store, legacyHidden = []) {
  const categories = Array.isArray(store) ? store : store?.categories;
  const cloneLegacyLeaves = nodes => nodes.map(n => ({ ...n, children: n.children === undefined ? [] : Array.isArray(n.children) ? cloneLegacyLeaves(n.children) : n.children }));
  const regular = cloneLegacyLeaves((categories || []).filter(n => n.id !== 'mottaro'));
  const state = readGeneratedTaxonomy(store, legacyHidden);
  const tree = validateEntries(regular, state);
  const hidden = new Set(state.hiddenIds);
  function prune(nodes, generated = false) {
    return nodes.filter(n => !(generated && hidden.has(n.id))).map(n => ({ ...n, children: prune(n.children, generated || n.id === 'mottaro') }));
  }
  return prune(tree);
}

// Serialize only manual descendants; generated nodes remain authoritative code.
// A versioned whole-tree replacement must preserve them unless explicitly deleted.
export function serializeTaxonomy(categories, { previous, legacyHidden = [], hiddenIds, removeManualPath = null } = {}) {
  validateTree(categories, { allowManual: true });
  const priorState = readGeneratedTaxonomy(previous, legacyHidden);
  const regular = structuredClone(categories.filter(n => n.id !== 'mottaro'));
  if (index(regular).paths.size && [...index(regular).paths.values()].some(n => n.manualGenerated)) fail('Manual generated nodes cannot be moved into an ordinary category.');
  const newBase = index(injectMotarroIntoTree(structuredClone(regular)));
  const oldRegular = (Array.isArray(previous) ? previous : previous?.categories || regular).filter(n => n.id !== 'mottaro');
  const oldBase = index(injectMotarroIntoTree(structuredClone(oldRegular)));
  const root = categories.find(n => n.id === 'mottaro'); const entries = [];
  function walk(nodes, parent, manual = false) {
    for (const [order, n] of nodes.entries()) {
      const path = [...parent,n.id];
      if (path.some(id=>priorState.hiddenIds.includes(id))) fail('Hidden generated folders cannot be supplied or edited.');
      const canonical = newBase.paths.get(key(path)), old = oldBase.paths.get(key(path));
      if (!manual && (canonical || old)) {
        if (n.manualGenerated || ![canonical?.label,old?.label].includes(n.label)) fail('Automatic categories cannot be replaced or renamed directly.');
        walk(n.children,path);
      } else {
        if (n.manualGenerated !== true) fail('Unknown automatic parent or missing manual category provenance.');
        entries.push({ path, label:n.label, order }); walk(n.children,path,true);
      }
    }
  }
  if (root) {
    walk([root],[]);
    const supplied = index([root]);
    for (const [pathKey, automatic] of oldBase.paths) {
      const path = JSON.parse(pathKey);
      if (path[0] !== 'mottaro' || path.some(id => priorState.hiddenIds.includes(id)) || !newBase.paths.has(pathKey)) continue;
      if (!supplied.paths.has(pathKey)) fail('Automatic folders must be hidden through the reviewed delete flow.');
      const inputIds = supplied.paths.get(pathKey).children.filter(n => !n.manualGenerated).map(n=>n.id);
      const oldIds = automatic.children.filter(n=>!priorState.hiddenIds.includes(n.id)).map(n=>n.id), newIds = newBase.paths.get(pathKey).children.filter(n=>!priorState.hiddenIds.includes(n.id)).map(n=>n.id);
      if (JSON.stringify(inputIds) !== JSON.stringify(oldIds) && JSON.stringify(inputIds) !== JSON.stringify(newIds)) fail('Automatic folder order comes from its source taxonomy.');
    }
  }
  const visible = new Set(entries.map(e=>key(e.path)));
  for (const entry of priorState.nodes) {
    const explicitlyRemoved = removeManualPath && removeManualPath.every((id,i)=>entry.path[i]===id);
    const hidden = entry.path.some(id=>priorState.hiddenIds.includes(id));
    if (explicitlyRemoved) continue;
    if (!root || hidden) { if (!visible.has(key(entry.path))) entries.push(entry); }
    else if (!visible.has(key(entry.path))) fail('Delete manual generated folders explicitly before replacing their subtree.');
  }
  const state = { version:1, hiddenIds:[...(hiddenIds ?? priorState.hiddenIds)], nodes:entries.sort((a,b)=>compare(key(a.path), key(b.path))) };
  const result = { categories:regular, generatedTaxonomy:state };
  readGeneratedTaxonomy(result); validateEntries(regular,state);
  return result;
}

// A view, an invalid path or an ambiguous historical ID is not an add target.
export function deepestTaxonomyParent(tree, path) {
  if (!Array.isArray(path) || !path.length || path.some(id=>!validId(id))) return null;
  const all = index(tree); let nodes = tree;
  for (const id of path) { const hits = (nodes || []).filter(n=>n.id===id); if (hits.length!==1) return null; nodes=hits[0].children; }
  const id=path.at(-1); let hits=0;
  for(const node of all.paths.values()) if(node.id===id) hits++;
  return hits===1 ? id : null;
}

export function isManualGeneratedPath(tree, path) {
  if (!Array.isArray(tree) || !Array.isArray(path) || !path.length || path.length > 16 || !path.every(validId)) return false;
  let nodes=tree, manual=false;
  for (const id of path) { const hits=(nodes || []).filter(n=>n.id===id); if(hits.length!==1)return false; const node=hits[0]; manual ||= node.manualGenerated === true; nodes=node.children; }
  return manual;
}
export function manualGeneratedPlacementPaths(product, tree) {
  return (Array.isArray(product?.placementPaths) ? product.placementPaths : []).filter(path=>isManualGeneratedPath(tree,path));
}

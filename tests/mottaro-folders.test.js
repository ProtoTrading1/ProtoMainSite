import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { injectMotarroIntoTree } from '../lib/mottaro-category.mjs';
import { graftMottaroFolders, sanitizeMottaroFolders } from '../lib/mottaro-folders.mjs';

// lib/mottaro-folders.mjs is byte-identical with Proto_Admin, which writes the
// folder list. If the two copies drift, a folder could sit in one place in
// Admin and another (or nowhere) on the website.
const MOTTARO_FOLDERS_SHARED_HASH = '9b3fc8180bf5d99a';
const readSource = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const BASE = [
  {
    id: 'arts-and-crafts',
    label: 'Arts and Crafts',
    children: [{ id: 'art-supplies', label: 'Art Supplies', children: [{ id: 'canvas', label: 'Canvas', children: [] }] }],
  },
];
const FOLDERS = [
  { id: 'mottaro-f-table-easels', parentId: 'mottaro-f-easels', label: 'Table Easels' },
  { id: 'mottaro-f-easels', parentId: 'mottaro-art-supplies', label: 'Easels' },
  { id: 'mottaro-f-gift-sets', parentId: 'mottaro', label: 'Gift Sets' },
];

function trail(nodes, id, path = []) {
  for (const node of nodes || []) {
    if (node.id === id) return [...path, node.id];
    const hit = trail(node.children, id, [...path, node.id]);
    if (hit) return hit;
  }
  return null;
}

test('shared Motarro folders module is still the Proto_Admin copy', async () => {
  const src = await readSource('lib/mottaro-folders.mjs');
  assert.equal(createHash('sha256').update(src).digest('hex').slice(0, 16), MOTTARO_FOLDERS_SHARED_HASH,
    'edit Proto_Admin/lib/mottaro-folders.mjs and this copy together, then update every pinned hash');
});

test('staff folders land under their exact parent, in any list order, without touching generated folders', () => {
  const generated = injectMotarroIntoTree(BASE, []);
  const tree = graftMottaroFolders(generated, FOLDERS, []);
  assert.deepEqual(trail(tree, 'mottaro-f-gift-sets'), ['mottaro', 'mottaro-f-gift-sets']);
  assert.deepEqual(trail(tree, 'mottaro-f-easels'), ['mottaro', 'mottaro-art-supplies', 'mottaro-f-easels']);
  assert.deepEqual(trail(tree, 'mottaro-f-table-easels'), ['mottaro', 'mottaro-art-supplies', 'mottaro-f-easels', 'mottaro-f-table-easels']);
  // The generated branch and the main tree are unchanged.
  assert.equal(trail(generated, 'mottaro-f-easels'), null);
  assert.deepEqual(trail(tree, 'canvas'), ['arts-and-crafts', 'art-supplies', 'canvas']);
  assert.deepEqual(trail(tree, 'mottaro-canvas'), ['mottaro', 'mottaro-art-supplies', 'mottaro-canvas']);
});

test('hidden or orphaned folders do not show, and junk records are ignored', () => {
  const generated = injectMotarroIntoTree(BASE, []);
  const hidden = graftMottaroFolders(generated, FOLDERS, ['mottaro-f-easels']);
  assert.equal(trail(hidden, 'mottaro-f-easels'), null);
  assert.equal(trail(hidden, 'mottaro-f-table-easels'), null);
  const orphan = graftMottaroFolders(generated, [{ id: 'mottaro-f-x', parentId: 'mottaro-gone', label: 'X' }], []);
  assert.equal(trail(orphan, 'mottaro-f-x'), null);
  assert.deepEqual(sanitizeMottaroFolders({ folders: [
    { id: 'not-staff', parentId: 'mottaro', label: 'A' },
    { id: 'mottaro-f-b', parentId: 'art-supplies', label: 'B' },
    { id: 'mottaro-f-c', parentId: 'mottaro', label: '' },
    'nonsense',
  ] }), []);
  // A staff folder can never shadow an existing id.
  const clash = graftMottaroFolders(generated, [{ id: 'mottaro-f-y', parentId: 'mottaro', label: 'Y' }, { id: 'mottaro-f-y', parentId: 'mottaro-art-supplies', label: 'Y again' }], []);
  assert.deepEqual(trail(clash, 'mottaro-f-y'), ['mottaro', 'mottaro-f-y']);
});

/** Minimal Supabase Storage stand-in: GET /storage/v1/object/site-config/<file>. */
async function withStorage(files, run) {
  const server = http.createServer((req, res) => {
    const match = req.url.match(/\/storage\/v1\/object\/(?:authenticated\/)?site-config\/(.+?)(?:\?|$)/);
    const file = match && decodeURIComponent(match[1]);
    if (file && Object.hasOwn(files, file)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(files[file]));
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const saved = { url: process.env.VITE_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  try {
    return await run();
  } finally {
    if (saved.url === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
    await new Promise((resolve) => server.close(resolve));
  }
}

async function getTaxonomy() {
  const { default: handler } = await import('../api/taxonomy.js');
  const res = {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  return res;
}

test('the public category tree shows staff Motarro folders saved by Admin', async () => {
  await withStorage({
    'taxonomy/categories.json': { categories: BASE },
    'taxonomy/mottaro-folders.json': { folders: FOLDERS },
  }, async () => {
    const res = await getTaxonomy();
    assert.equal(res.statusCode, 200);
    const tree = res.body.categories;
    assert.deepEqual(trail(tree, 'mottaro-f-table-easels'), ['mottaro', 'mottaro-art-supplies', 'mottaro-f-easels', 'mottaro-f-table-easels']);
    assert.deepEqual(trail(tree, 'mottaro-f-gift-sets'), ['mottaro', 'mottaro-f-gift-sets']);
  });
});

test('with no folder file the public tree is exactly as before', async () => {
  await withStorage({ 'taxonomy/categories.json': { categories: BASE } }, async () => {
    const res = await getTaxonomy();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.categories, injectMotarroIntoTree(BASE, []));
  });
});

test('catalogue, browsing and counts include staff folders and placements', async () => {
  const [products, client] = await Promise.all([readSource('api/products.js'), readSource('src/lib/products.js')]);
  // Product paths are resolved against the same grafted tree as the menu.
  assert.match(products, /graftMottaroFolders\(injectMotarroIntoTree\(categories, hidden\), staffFolders, hidden\)/);
  // A Motarro department click fetches Motarro-titled rows, not category = "Motarro".
  assert.match(products, /motarroBrowse \? motarroTitleFilter : primaryBrowseFilter\(labels\)/);
  // Browsing a Motarro folder accepts exact-id placements before the brand check.
  assert.match(client, /if \(isMotarroBrowsePath\(navPath\)\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(productPaths\(product\)\.some/);
  // Counts include placements under Motarro.
  assert.match(client, /if \(productPath\[0\] === 'mottaro'\) \{[\s\S]*?mottaroByNavPath\.get/);
});

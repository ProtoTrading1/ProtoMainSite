import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('release manifest binds each selected main and every asset to the reviewed batch', async () => {
  const manifestBytes = await readFile(new URL('../api/_website-only-manifest.json', import.meta.url));
  assert.equal(createHash('sha256').update(manifestBytes).digest('hex'),'4318801942b220d2a5bd6c125145828ce912887b6ce71e5ebcd39dbe889f741f');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.items.length, 163);
  assert.equal(new Set(manifest.items.map(x => x.sku)).size, 163);
  assert.equal(manifest.items.reduce((n, x) => n + x.photos.length, 0), 246);
  for (const item of manifest.items) {
    assert.notEqual(item.sku, 'L-TON1104');
    assert.equal(item.sku.startsWith('KDIS'), false);
    assert.ok(item.description && item.units, item.sku);
    assert.ok(item.photos.some(photo=>photo.path===item.mainPath && photo.sha256===item.mainSha256),item.sku);
    for (const photo of item.photos) {
      assert.match(photo.path, /^\/product-options\/website-only-163\/[A-Z0-9-]+\/[a-f0-9]{64}\.(jpg|png)$/);
      const data = await readFile(new URL('../public' + photo.path, import.meta.url));
      assert.equal(createHash('sha256').update(data).digest('hex'), photo.sha256, item.sku);
    }
  }
});

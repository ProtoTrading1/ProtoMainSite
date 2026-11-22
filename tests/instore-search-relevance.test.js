import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery, searchQueryVariants, searchRecoveryTerms } from '../lib/search-language.mjs';
import { prepareInstoreSearch } from '../lib/instore-discovery.mjs';
import { fuzzyFilter } from '../src/lib/fuzzySearch.js';
import { buildExtendedRangeProducts, excludeMainCatalogueProducts } from '../api/extended-range.js';
import { mainNapkinProducts, instoreNapkinProducts, historicalNapkinIndexRow, sharedNapkinBarcode } from './fixtures/instore-search-relevance.mjs';

const instoreFilter = (products, query) => {
  const search = prepareInstoreSearch(query);
  return products.filter(search.matches).sort(search.compare);
};
const ids = rows => rows.map(row => row.sku);

for (const [scope, filter] of [['Main', fuzzyFilter], ['Instore', instoreFilter]]) {
  test(`${scope}: both regional words and plurals preserve Christmas qualifiers and literal priority`, () => {
    const products = [...mainNapkinProducts, ...instoreNapkinProducts];
    for (const query of ['napkin', 'napkins', 'serviette', 'serviettes', 'NAPKINS']) {
      assert.deepEqual(new Set(ids(filter(products, query))), new Set([
        '8636276005', '8201RED', '8201BLUE', 'LITERAL-NAPKIN', 'BIRTHDAY-SERVIETTE', '8640000272',
      ]), query);
    }
    for (const query of ['napkins christmas', 'christmas napkins', 'serviettes christmas', 'christmas serviette']) {
      assert.deepEqual(new Set(ids(filter(products, query))), new Set(['8636276005', 'LITERAL-NAPKIN', '8640000272']), query);
    }
    assert.equal(filter(products, 'napkin christmas')[0].sku, 'LITERAL-NAPKIN');
    const literalProducts = [
      { sku: 'REGIONAL', name: 'Paper Serviette', title: 'Paper Serviette' },
      { sku: 'LITERAL', name: 'Paper Napkin', title: 'Paper Napkin' },
    ];
    assert.equal(filter(literalProducts, 'napkins')[0].sku, 'LITERAL');
    assert.equal(filter(literalProducts, 'serviettes')[0].sku, 'REGIONAL');
    assert.deepEqual(ids(filter(products, 'napkins blue')), ['8201BLUE']);
    assert.deepEqual(ids(filter(products, 'serviettes blue')), ['8201BLUE']);
  });

  test(`${scope}: exact identifiers retain normalization, shared variants and channel separation`, () => {
    for (const query of ['8636276005', 'SKU: 8636276005', '8636-276005', '8636 276005']) {
      assert.deepEqual(ids(filter(mainNapkinProducts, query)), ['8636276005'], query);
      assert.deepEqual(filter(instoreNapkinProducts, query), [], query);
    }
    assert.deepEqual(ids(filter(instoreNapkinProducts, '8640000272')), ['8640000272']);
    assert.deepEqual(filter(mainNapkinProducts, '8640000272'), []);
    for (const query of [sharedNapkinBarcode, `barcode: ${sharedNapkinBarcode}`, '8990 0000 08201', '8201']) {
      assert.deepEqual(new Set(ids(filter(mainNapkinProducts, query))), new Set(['8201RED', '8201BLUE']), query);
    }
    const exactSku = { sku: sharedNapkinBarcode, name: 'Exact SKU', title: 'Exact SKU' };
    assert.equal(filter([...mainNapkinProducts, exactSku], sharedNapkinBarcode)[0], exactSku);
    // A title that merely contains the identifier cannot outrank or join it.
    const titleOnly = { sku: 'TITLE-ONLY', name: '8636276005', title: '8636276005' };
    assert.deepEqual(ids(filter([titleOnly, ...mainNapkinProducts], '8636276005')), ['8636276005']);
  });

  test(`${scope}: no-match and unrelated relevance remain bounded`, () => {
    for (const query of ['napkins halloween', 'napkinzebra', 'servietteholder', '8640000273', 'resin']) {
      assert.deepEqual(filter([...mainNapkinProducts, ...instoreNapkinProducts], query), [], query);
    }
    assert.deepEqual(ids(filter(mainNapkinProducts, 'barber brush')), ['UNRELATED-BRUSH']);
    assert.deepEqual(ids(filter(mainNapkinProducts, 'christmas plates')), ['CHRISTMAS-PLATE']);
  });
}

test('regional replacement retains every lexical qualifier and leaves other directional expansions scoped', () => {
  assert.deepEqual(searchQueryVariants('napkins christmas'), ['napkins christmas', 'serviette christmas']);
  assert.deepEqual(searchQueryVariants('christmas serviettes'), ['christmas serviettes', 'christmas napkin']);
  assert.equal(parseSearchQuery('napkins christmas').text, 'napkins christmas');
  assert.deepEqual(searchRecoveryTerms('napkin'), ['serviette']);
  assert.deepEqual(searchQueryVariants('journal christmas'), ['journal christmas']);
  assert.deepEqual(searchQueryVariants('koki christmas'), ['koki christmas']);
  assert.deepEqual(searchQueryVariants('8640000272'), ['8640000272']);
});

test('historical search-only rows prove neither availability nor an additional channel', () => {
  assert.deepEqual(buildExtendedRangeProducts([historicalNapkinIndexRow], 'napkins'), []);
  const duplicate = { ...instoreNapkinProducts[0], ...mainNapkinProducts[0], isExtendedRange: true };
  assert.deepEqual(excludeMainCatalogueProducts([...instoreNapkinProducts, duplicate], mainNapkinProducts), instoreNapkinProducts);
  // Even if a duplicate row later passes stock checks, suppress it by its
  // existing exact identifier, without changing its price or stock evidence.
  const rows = [historicalNapkinIndexRow, { ...historicalNapkinIndexRow, available_stock: 100 }];
  const built = buildExtendedRangeProducts(rows, 'napkins christmas');
  assert.equal(built.length, 1);
  assert.deepEqual(excludeMainCatalogueProducts(built, mainNapkinProducts), []);
  for (const patch of [{ visibility_status: 'hidden' }, { is_active: false }, { image_review_status: 'pending' }, { listing_control_status: 'hidden' }]) {
    assert.deepEqual(buildExtendedRangeProducts([{ ...historicalNapkinIndexRow, available_stock: 100, ...patch }], 'napkins'), []);
  }
  assert.equal(historicalNapkinIndexRow.available_stock, null);
  assert.equal(historicalNapkinIndexRow.price, 25);
});

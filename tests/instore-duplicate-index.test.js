import assert from 'node:assert/strict';
import test from 'node:test';
import { excludeMainCatalogueProducts } from '../api/extended-range.js';
import { evaluateInstoreDuplicate, prepareInstoreDuplicateEvaluator } from '../lib/instore-duplicate-gate.mjs';

const complete = rows => ({ status: 'success', rows, complete: true, variantsIncluded: true });
const fields = candidate => [candidate?.sku, candidate?.code, candidate?.barcode];
const rich = (candidate, lookup, checkedIdentifiers = fields(candidate)) =>
  evaluateInstoreDuplicate(candidate, { ...lookup, checkedIdentifiers });

test('prepared lookup preserves exact matches, field multiplicity, and depth-first row order', () => {
  const child = { sku: 'C', code: ' a ', barcode: 'B' };
  const parent = { sku: ' b ', code: 'A', barcode: 'b', variants: [child] };
  const later = { sku: 'A', code: 'C' };
  child.variants = [child, parent];
  const lookup = complete([parent, child, later, parent]);
  const candidate = { sku: '  a ', code: 'b', barcode: 'c' };
  const actual = prepareInstoreDuplicateEvaluator(lookup)(candidate, fields(candidate));
  assert.deepEqual(actual, rich(candidate, lookup));
  assert.deepEqual(actual.matches.map(m => [m.identifier, m.candidateField, m.catalogueField]), [
    ['A', 'sku', 'code'], ['B', 'code', 'sku'], ['B', 'code', 'barcode'],
    ['A', 'sku', 'code'], ['B', 'code', 'barcode'], ['C', 'barcode', 'sku'],
    ['A', 'sku', 'sku'], ['C', 'barcode', 'code'],
  ]);
  // The duplicate rule is exact, not the punctuation and suffix-aware search rule.
  const extra = complete([{ sku: ' MP130-1 ', barcode: '8616300009B' }]);
  const decide = prepareInstoreDuplicateEvaluator(extra);
  for (const [value, expected] of [['mp130-1', 'exclude'], ['MP1301', 'eligible'], ['8616300009', 'eligible'], ['8616300009B', 'exclude']]) {
    assert.equal(decide({ sku: value }, [value]).decision, expected);
  }
});

test('prepared lookup retains every hold precedence and never lets an exact hit hide a malformed row', () => {
  const input = { sku: 'A' };
  const cases = [
    [null, ['A'], 'lookup_failed'],
    [{ ...complete([]), error: true }, ['A'], 'lookup_failed'],
    [{ ...complete([]), status: 'failed' }, ['A'], 'lookup_failed'],
    [{ ...complete([]), complete: 1 }, ['A'], 'lookup_incomplete'],
    [{ ...complete([]), variantsIncluded: false }, ['A'], 'lookup_incomplete'],
    [complete(null), ['A'], 'lookup_incomplete'],
    [complete([{ sku: 'A' }, null]), ['something else'], 'identifier_coverage_incomplete'],
    [complete([{ sku: 'A' }, null]), 'A', 'identifier_coverage_incomplete'],
    [complete([{ sku: 'A' }, []]), ['A'], 'invalid_catalogue_rows'],
    [complete([{ sku: 'A' }, { sku: 42 }]), ['A'], 'invalid_catalogue_rows'],
    [complete([{ sku: 'A' }, { sku: ' ', code: null }]), ['A'], 'invalid_catalogue_rows'],
    [complete([{ sku: 'A', barcode: {} }]), ['A'], 'invalid_catalogue_rows'],
    [complete([{ sku: 'A', variants: {} }]), ['A'], 'invalid_catalogue_rows'],
    [complete([{ sku: 'A', variants: [{ sku: 'B', variants: [undefined] }] }]), ['A'], 'invalid_catalogue_rows'],
  ];
  for (const [lookup, checked, reason] of cases) {
    const decide = prepareInstoreDuplicateEvaluator(lookup);
    assert.equal(decide(input, checked).reason, reason);
    assert.deepEqual(decide(input, checked), rich(input, lookup, checked));
    for (const invalid of [null, [], {}, { sku: 9 }, { sku: 'A', barcode: {} }]) {
      assert.equal(decide(invalid, checked).reason, 'invalid_candidate_identifiers');
    }
  }
  assert.deepEqual(excludeMainCatalogueProducts([], null), []);
  assert.throws(() => excludeMainCatalogueProducts([input], [{ sku: 'A' }, null]), /Catalogue duplicate review required/);
});

test('bulk exclusion keeps eligible product order and identity, and normalises shared catalogue only once', () => {
  let mainReads = 0;
  const deep = { get sku() { mainReads++; return 'B'; } };
  const root = { get sku() { mainReads++; return 'A'; }, barcode: 'B', variants: [deep] };
  deep.variants = [root, deep];
  const first = { sku: 'Z', id: 19, arbitrary: 'preserved' };
  const second = { sku: 'Y', flags: { title: 'unchanged' } };
  const candidates = [first, { sku: 'b' }, second, { code: '  a  ' }, first];
  const rows = [root, deep, root];
  const outputs = excludeMainCatalogueProducts(candidates, rows);
  assert.deepEqual(outputs, [first, second, first]);
  assert.equal(outputs[0], first);
  assert.equal(outputs[1], second);
  assert.equal(outputs[2], first);
  assert.equal(mainReads, 2, 'each distinct row is traversed once, even with sharing and a cycle');
  assert.deepEqual(excludeMainCatalogueProducts(candidates, [{ sku: 'Z' }]), candidates.slice(1, 4),
    'a later bulk call builds from its own input, not a prior cache');
});

test('prepared and rich results stay byte-for-byte equal over a deterministic mixed corpus', () => {
  const pack = [];
  const ids = ['AB', ' a-b ', 'X03', '99', '99B', 'AB', 'CS', ''];
  for (let i = 0; i < 75; i++) {
    pack.push({ sku: 'P-' + i, ...(i % 3 ? { barcode: ids[i % ids.length] } : { code: ids[i % ids.length] }) });
    if (i > 1 && i % 6 === 0) pack[i].variants = [pack[i - 1], { sku: ids[(i / 6) % (ids.length - 1)], variants: [pack[i - 2]] }];
  }
  pack[0].variants = [pack.at(-1), pack[0]];
  const lookup = complete(pack);
  const decide = prepareInstoreDuplicateEvaluator(lookup);
  const candidates = Array.from({ length: 180 }, (_, i) => ({
    sku: i % 7 ? 'p-' + i : 'NOT-MAIN-' + i, code: i % 3 ? ids[i % ids.length] : '', barcode: i % 11 ? '' : '99b',
  }));
  for (const candidate of candidates) assert.deepEqual(decide(candidate, fields(candidate)), rich(candidate, lookup));
  assert.deepEqual(excludeMainCatalogueProducts(candidates, pack), candidates.filter(candidate => rich(candidate, lookup).canImport));
});

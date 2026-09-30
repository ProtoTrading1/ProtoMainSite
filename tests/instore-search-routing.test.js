import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHash, parseHash } from '../src/lib/hashRoute.js';
import {
  instoreSearchQueryFromRefinements,
  instorePageFromRefinements,
  instorePageRefinements,
  instoreSearchRefinements,
  instoreSearchRoute,
} from '../src/lib/instoreSearchRoute.js';

test('combined catalogue search hands its exact query to the Instore route', () => {
  const route = instoreSearchRoute('  soft   toys & dolls  ');
  const hash = buildHash(route.path, route.refinements);

  assert.equal(hash, '#/instore-products?q=soft+toys+%26+dolls');
  const restored = parseHash(hash);
  assert.deepEqual(restored.path, ['instore-products']);
  assert.equal(instoreSearchQueryFromRefinements(restored.refinements), 'soft toys & dolls');
});

test('a direct Instore search survives a hash round trip and replaces browse state', () => {
  const refinements = instoreSearchRefinements({ browse: 'Soft toys' }, 'blue dolphin 50cm');
  const restored = parseHash(buildHash(['instore-products'], refinements));

  assert.deepEqual(restored.refinements, { q: 'blue dolphin 50cm' });
  assert.equal(instoreSearchQueryFromRefinements(restored.refinements), 'blue dolphin 50cm');
});

test('clearing an Instore search removes only search and browse refinements', () => {
  const refinements = instoreSearchRefinements({ q: 'soft toys', browse: 'Soft toys', page: '4', campaign: 'spring' }, '  ');

  assert.deepEqual(refinements, { campaign: 'spring' });
});

test('an Instore result page survives refresh and back-navigation hash parsing', () => {
  const refinements = instorePageRefinements({ q: 'soft toys' }, 3);
  const restored = parseHash(buildHash(['instore-products'], refinements));

  assert.equal(instoreSearchQueryFromRefinements(restored.refinements), 'soft toys');
  assert.equal(instorePageFromRefinements(restored.refinements), 3);
});

test('page one stays canonical and malformed pages safely become page one', () => {
  assert.deepEqual(instorePageRefinements({ q: 'dolls', page: '8' }, 1), { q: 'dolls' });
  assert.equal(instorePageFromRefinements({ page: '-4' }), 1);
  assert.equal(instorePageFromRefinements({ page: 'not-a-page' }), 1);
});

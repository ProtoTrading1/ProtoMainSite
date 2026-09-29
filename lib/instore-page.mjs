import { compareInstoreSearch, discoveryGroup, matchesInstoreSearch } from './instore-discovery.mjs';

export const INSTORE_PAGE_SIZE = 60;

/**
 * One definition of what a page of Instore Products is: which products match,
 * in what order, and which of them this page shows.
 *
 * The API uses it, and so does the browser once it holds the whole collection,
 * so a locally answered search can never drift from a server-answered one.
 * It decides nothing about eligibility — every product handed to it has already
 * passed the image, price, stock and duplicate gates.
 *
 * Products must arrive in SKU order, which is the order every reader produces
 * them in, because equal-scoring products tie in the order they are given.
 */
export function instorePage(products, { query = '', category = '', page = 1, pageSize = INSTORE_PAGE_SIZE } = {}) {
  const matching = (products || [])
    .filter((product) => matchesInstoreSearch(product, query) && (!category || discoveryGroup(product) === category))
    .sort((left, right) => compareInstoreSearch(left, right, query));
  const from = (Math.max(1, page) - 1) * pageSize;
  return { products: matching.slice(from, from + pageSize), total: matching.length, from };
}

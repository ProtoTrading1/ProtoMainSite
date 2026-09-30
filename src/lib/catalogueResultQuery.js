const EMPTY_PRODUCTS = [];

/** Keep catalogue results visible only for the committed query that produced them. */
export function catalogueResultsForQuery(requestedQuery, resultQuery, products, total) {
  if (String(requestedQuery || '').trim() !== String(resultQuery || '').trim()) {
    return { products: EMPTY_PRODUCTS, total: 0 };
  }
  return { products, total };
}

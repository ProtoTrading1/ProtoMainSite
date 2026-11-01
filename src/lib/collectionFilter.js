export function applyCollection(products, collection, specialIds = null) {
  if (collection === 'hot') return [...products].sort((a, b) => b.yearlySales - a.yearlySales);
  if (collection === 'just-added') return products.filter((product) => product.isNew === true);
  if (collection === 'specials') return products.filter((product) => specialIds && specialIds.has(product.id));
  return products;
}

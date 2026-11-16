export function sortNewArrivals(products) {
  return [...products].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

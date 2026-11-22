// Synthetic only: identifiers model the brief; titles, barcodes, stock and
// prices are test values and do not establish live availability or pricing.
const product = (sku, name, extra = {}) => ({
  id: sku, sku, websiteSku: sku, code: sku, barcode: `SYNTHETIC-${sku}`,
  name, title: name, description: name, image: '/favicon.svg',
  price: 25, stockOnHand: 100, stockQty: 100, inStock: true,
  minQty: 1, categoryPath: [], ...extra,
});
export const sharedNapkinBarcode = '8990000008201';
export const mainNapkinProducts = [
  product('8636276005', 'Christmas Serviettes 20-Pack'),
  ...['RED', 'BLUE'].map(colour => product(`8201${colour}`, `Serviettes PACK100 ${colour}`, {
    barcode: sharedNapkinBarcode, colour,
  })),
  product('LITERAL-NAPKIN', 'Napkin Christmas'),
  product('BIRTHDAY-SERVIETTE', 'Birthday Serviettes'),
  product('CHRISTMAS-PLATE', 'Christmas Plates'),
  product('UNRELATED-BRUSH', 'Barber Brush'),
];
export const instoreNapkinProducts = [
  product('8640000272', 'Christmas Serviettes In-store', { isExtendedRange: true }),
];
export const historicalNapkinIndexRow = {
  sku: '8636276005', barcode: 'SYNTHETIC-8636276005', title: 'Christmas Serviettes 20-Pack',
  visibility_status: 'search_only', is_active: true, image_review_status: 'verified',
  image_url: 'https://example.invalid/synthetic-serviettes.jpg', price: 25,
  available_stock: null,
};

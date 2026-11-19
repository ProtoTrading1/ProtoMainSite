// Synthetic, deterministic catalogue for search compatibility and browser timing.
const names = [
  'DRAWSTRING BRACELET ORANGE', 'GLASS BEAD BLUE', 'NOTEBOOK A5',
  'HAIR CLIP PURPLE', 'MUG CERAMIC', 'SOFT TOY TEDDY BEAR 50CM',
  'PAINT BRUSH SET', 'HAIR BRUSH', 'WALLET LEATHER BROWN',
  'BAG BACKPACK BLUE', 'PLUSH PEN', 'BARBER BRUSH',
  'USB CHARGER QC3.0 MAX 28.5W', 'RIBBON RED 0.5M',
  'T SHIRT XL GREY', 'SOFT TOY DOLPHIN BLUE 50CM',
  'NECKLACE WOODEN BEADS', 'BALLOON PINK 12IN',
];

export function searchProducts(count = 180) {
  return Array.from({ length: count }, (_, i) => ({
    id: `SYNTHETIC-${i}`, sku: `K${100000 + i}`, barcode: String(8600000000 + i),
    name: names[i % names.length], originalDescription: names[i % names.length],
    price: 10 + i % 120, stockQty: i % 37, stockOnHand: i % 37,
    minQty: 1, isExtendedRange: true,
    image: '/favicon.svg', images: ['/favicon.svg'],
  }));
}

export const searchQueries = [
  '', 'bracelets', 'hair clips', 'blue beads under R100', 'K100032',
  '8600000032', 'K10', 'hair brush', 'paintbrushes', 'wallet', 'bags',
  'soft toys', 'sotf toys dolphin', 'blue teddy 50cm', 'plush pen', 'blush',
  'in stock red ribbon under R100', '0.5m ribbon', 'QC3.0', 'max 28.5w',
  'grey XL shirt', 'wood beads', 'this should never match',
];

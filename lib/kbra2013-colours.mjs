// One Positill item: colours are preferences, not individually stocked SKUs.
export const TURTLE_BRACELET_COLOURS = Object.freeze([
  Object.freeze({ label: 'Brown', image: '/product-options/kbra2013/k.bra.2013brn.jpg' }),
  Object.freeze({ label: 'Black', image: '/product-options/kbra2013/k.bra.2013blk.jpg' }),
  Object.freeze({ label: 'Turquoise', image: '/product-options/kbra2013/k.bra.2013tur.jpg' }),
  Object.freeze({ label: 'White', image: '/product-options/kbra2013/k.bra.2013whi.jpg' }),
]);

export function isTurtleBracelet(product) {
  const sku = product?.sku || product?.websiteSku || product?.code || product?.id;
  return String(sku || '').trim().toUpperCase() === 'KBRA2013';
}

export function turtleBraceletOption(label) {
  return TURTLE_BRACELET_COLOURS.find(option => option.label === label) || TURTLE_BRACELET_COLOURS[0];
}

export function withTurtleBraceletPhoto(product, label) {
  if (!isTurtleBracelet(product)) return product;
  const { image } = turtleBraceletOption(label);
  return { ...product, localImage: image, image, remoteImage: image, images: [image] };
}

import { sarongiInstoreGallery } from './sarongi-instore-gallery.mjs';
import labels from './reviewed-colour-labels.json' with { type: 'json' };
import supplierStock from './supplier-stock-list-20261124.json' with { type: 'json' };

const reviewedLabels = new Map(labels.map(p => [`${p.sku}:${p.sha256}`, p.label]));
const listedPhotos = new Set(supplierStock.photos.map(p => `${p.sku}:${p.sha256}`));
const listedProducts = new Set(supplierStock.productSkus);
export const SUPPLIER_STOCK_DATE = supplierStock.asOf;
export function supplierNamedOptionAvailable(sku, label) {
  return supplierStock.namedOptions?.[sku]?.includes(label) === true;
}

export function supplierStockAvailable(product) {
  if (!product || product.imageStatus === 'hidden' || product.isVariantGroup) return false;
  const sku = String(product.sku || product.id || '').toUpperCase();
  if (listedProducts.has(sku)) return true;
  const photos = sarongiInstoreGallery(sku, product.image);
  if (photos.length !== 1) return false;
  const hash = new URL(photos[0].image).pathname.split('/').pop().split('.')[0];
  return listedPhotos.has(`${sku}:${hash}`);
}

// Only reviewed colour/design photos are options. Multiple angles alone never
// create variants, and a changed/removed gallery cannot resurrect old photos.
export function reviewedColourOptions(product) {
  if (!product || product.isVariantGroup || product.imageStatus === 'hidden') return [];
  const sku = String(product.sku || product.id || '').toUpperCase();
  const photos = sarongiInstoreGallery(sku, product.image);
  if (photos.length < 2 || !Array.isArray(product.images) || product.images.length !== photos.length
    || new Set(product.images).size !== photos.length
    || product.images.some(image => !photos.some(p => p.image === image))) return [];
  return photos.map(photo => {
    const hash = new URL(photo.image).pathname.split('/').pop().split('.')[0];
    return { ...photo, label: reviewedLabels.get(`${sku}:${hash}`) || photo.label,
      stockAvailable: listedPhotos.has(`${sku}:${hash}`) };
  });
}

export function withReviewedColourPhoto(product, preference) {
  const options = reviewedColourOptions(product);
  const selected = options.find(p => p.label === preference);
  if (!selected) return product;
  return { ...product, image: selected.image, localImage: selected.image, remoteImage: selected.image,
    images: [selected.image, ...options.filter(p => p !== selected).map(p => p.image)] };
}

// Order rows are rebuilt from authoritative website data; never trust an image
// supplied by a browser. The SKU and approved main identify the reviewed set.
export function reviewedColourOrderImage(sku, currentMain, preference) {
  const photos = sarongiInstoreGallery(sku, currentMain);
  const product = { sku, image: currentMain, images: photos.map(p => p.image) };
  return withReviewedColourPhoto(product, preference).image;
}

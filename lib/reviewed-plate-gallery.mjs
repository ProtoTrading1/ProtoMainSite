import plate from './reviewed-plate-gallery.json' with { type: 'json' };

// One reviewed SKU and one exact existing collage. Relative option paths are
// served by the same storefront build in local previews and on the live site.
const photos = [plate.overview, ...plate.options];
export function reviewedPlateGallery(sku, main) {
  if (sku !== plate.sku || !photos.some(photo => photo.image === main)) return [];
  return photos.map(photo => ({ ...photo, stockAvailable: false }));
}

export function withReviewedPlateGallery(product) {
  if (!product || product.isVariantGroup || product.imageStatus === 'hidden'
    || String(product.sku || product.id || '').toUpperCase() !== plate.sku
    || product.image !== plate.canonicalMainImage || !Array.isArray(product.images)
    || product.images.length !== 1 || product.images[0] !== product.image) return product;
  return { ...product, images: photos.map(photo => photo.image) };
}

export function reviewedPlateOptions(product) {
  if (!product || product.isVariantGroup || product.imageStatus === 'hidden') return [];
  const gallery = reviewedPlateGallery(String(product.sku || product.id || '').toUpperCase(), product.image);
  if (!gallery.length || !Array.isArray(product.images) || product.images.length !== photos.length
    || new Set(product.images).size !== photos.length
    || product.images.some(image => !gallery.some(photo => photo.image === image))) return [];
  // The collage is an overview, never a colour or an order preference.
  return gallery.slice(1);
}

export function reviewedPlateOrderImage(sku, currentMain, preference) {
  if (sku !== plate.sku || currentMain !== plate.canonicalMainImage) return null;
  const selected = plate.options.find(option => option.label === preference);
  if (!selected) {
    const error = new Error('Choose a reviewed plate colour before sending your order request.');
    error.status = 400;
    throw error;
  }
  // Emails and saved order rows require an absolute, server-owned URL.
  return new URL(selected.image, 'https://www.proto.co.za').href;
}

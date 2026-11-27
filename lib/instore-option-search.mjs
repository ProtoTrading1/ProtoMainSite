import { SARONGI_GALLERIES } from './sarongi-instore-gallery-data.mjs';
import { sarongiInstoreGallery } from './sarongi-instore-gallery.mjs';
import {cat07CustomerOptions} from './cat07-customer-gallery.mjs';

// Search only the reviewed labels, never image URLs, filenames or supplier
// metadata. Resolve at search time so older browser/snapshot payloads work too.
export const REVIEWED_OPTION_SKUS = Object.freeze([...Object.keys(SARONGI_GALLERIES),'8640000274']);

export function instoreOptionSearchText(product) {
  if (product?.isExtendedRange !== true || product?.imageStatus === 'hidden') return '';
  if(product.sku==='8640000274')return cat07CustomerOptions(product).map(view=>view.label).join(' ');
  return sarongiInstoreGallery(product.sku, product.image).map(photo => photo.label).join(' ');
}

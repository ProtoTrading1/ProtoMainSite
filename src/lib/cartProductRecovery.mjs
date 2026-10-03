import { basketProductSource } from '../../lib/basket-lines.mjs';

export const CART_PRODUCT_REVIEW_MESSAGE = 'Some saved products could not be confirmed. Your basket is kept. Reload product details, or contact Proto to recover these products before ordering.';
export const knownCartProductSource = basketProductSource;

function identifiers(product) {
  return [product?.id, product?.productId, product?.sku, product?.code]
    .map(value => String(value ?? '').trim().toUpperCase()).filter(Boolean);
}

// Only a freshly chosen catalogue product may receive its explicit catalogue
// context. Never call this to infer the origin of a historical SKU match.
export function freshCartProduct(product, sourceHint) {
  const source = knownCartProductSource(product);
  const context = ['main', 'instore'].includes(sourceHint) ? sourceHint : null;
  const conflicting = typeof product?.isExtendedRange === 'boolean'
    && ['main', 'instore'].includes(product?.source) && !source;
  if (conflicting) return { ...product };
  if (source && context && source !== context) {
    return { ...product, source: context, isExtendedRange: source === 'instore' };
  }
  const confirmed = source || context;
  return confirmed ? { ...product, source: confirmed, isExtendedRange: confirmed === 'instore' } : { ...product };
}

export function verifiedReorderProduct(item, product, sourceHint) {
  const historical = item?.product || item;
  const source = knownCartProductSource(historical);
  if (!source || !product || item?.accountProductNeedsReview === true) return null;
  const fresh = freshCartProduct(product, sourceHint);
  if (knownCartProductSource(fresh) !== source) return null;
  const liveKeys = new Set(identifiers(fresh));
  return identifiers(historical).some(key => liveKeys.has(key)) ? fresh : null;
}

// The map is a fresh main-catalogue lookup. Its matching SKU proves existence,
// while explicit saved hints establish whether refreshing the line is safe.
export function recoverCartProducts(items, bySku = new Map()) {
  return (Array.isArray(items) ? items : []).map(item => {
    const source = knownCartProductSource(item?.product);
    const live = source === 'main' ? identifiers(item.product).map(key => bySku.get(key)).find(Boolean) : null;
    const retained = { ...item };
    delete retained.accountProductNeedsReview;
    if (!source) return { ...retained, accountProductNeedsReview: true };
    if (live) {
      const verified = verifiedReorderProduct({ product: item.product }, live, 'main');
      if (verified) return { ...retained, product: verified };
    }
    return { ...retained, product: freshCartProduct(item.product) };
  });
}

export function cartProductsNeedReview(items) {
  return (Array.isArray(items) ? items : []).some(item => (
    item?.accountProductNeedsReview === true || !knownCartProductSource(item?.product)
  ));
}

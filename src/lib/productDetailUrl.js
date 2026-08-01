export const PRODUCT_DETAIL_PARAM = 'product';

export function productDetailId(product) {
  return String(
    product?.websiteSku
    || product?.sku
    || product?.id
    || product?.code
    || product?.barcode
    || '',
  ).trim();
}

function parseCatalogueHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const queryIndex = raw.indexOf('?');
  const path = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  const query = queryIndex >= 0 ? raw.slice(queryIndex + 1) : '';
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    params: new URLSearchParams(query),
  };
}

function serializeCatalogueHash(path, params) {
  const query = params.toString();
  return `#${path || '/'}${query ? `?${query}` : ''}`;
}

export function readProductDetailFromHash(hash = globalThis.location?.hash || '') {
  const { params } = parseCatalogueHash(hash);
  return String(params.get(PRODUCT_DETAIL_PARAM) || '').trim();
}

export function withProductDetailHash(hash, productOrId) {
  const id = typeof productOrId === 'object' ? productDetailId(productOrId) : String(productOrId || '').trim();
  const { path, params } = parseCatalogueHash(hash);
  if (id) params.set(PRODUCT_DETAIL_PARAM, id);
  else params.delete(PRODUCT_DETAIL_PARAM);
  return serializeCatalogueHash(path, params);
}

export function withoutProductDetailHash(hash) {
  return withProductDetailHash(hash, '');
}

export function buildProductDetailUrl(product, href = globalThis.location?.href || '') {
  const id = productDetailId(product);
  if (!href || !id) return '';
  const url = new URL(href);
  url.hash = withProductDetailHash(url.hash, id);
  return url.toString();
}

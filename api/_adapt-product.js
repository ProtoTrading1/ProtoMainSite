import SKU_SUBS from './_sku-subcategories.js';
import { buildCategoryPath } from '../src/lib/categoryPath.js';

function parseImageUrls(imageValue) {
  return String(imageValue || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

export function adaptProduct(wpRow, stockRow) {
  const stockQty = stockRow?.stock_qty ?? 0;
  const categoryPath = buildCategoryPath(wpRow, SKU_SUBS);
  const deptSlug = categoryPath[0] || '';
  const images = parseImageUrls(wpRow.image_url);

  return {
    id: wpRow.website_sku,
    code: wpRow.barcode,
    barcode: wpRow.barcode,
    websiteSku: wpRow.website_sku,
    parentSku: wpRow.parent_sku,
    name: wpRow.title,
    description: wpRow.description || '',
    price: Number(stockRow?.sell_price ?? 0),
    images,
    image: images[0] || '',
    secondaryImage: images[1] || '',
    stockQty,
    stockOnHand: stockQty,
    colour: wpRow.colour || '',
    category: deptSlug,
    categoryPath,
    tags: [],
    badges: [],
    isNew: false,
    isSpecial: false,
    isArchived: !wpRow.active,
    sortOrder: wpRow.sort_order || 0,
    minQty: 1,
    casePack: '',
    marginCue: '',
    leadTime: '',
    tradeNote: '',
    inStock: stockQty > 0,
    createdAt: wpRow.created_at,
    yearlySales: stockRow?.yearly_sales ?? 0,
    supplier: stockRow?.supplier || '',
  };
}

// Curated against registration labels and verified catalogue category_path segments.
// General merchandise, Other, Pet products and Promotional products intentionally have no mapping.
export const INTEREST_PATHS = {
  'Art, craft & beads': [['arts-crafts-stationery','paint-art-supplies'],['arts-crafts-stationery','canvas-art-surfaces'],['beads-jewellery']],
  'Stationery & educational products': [['arts-crafts-stationery','books-pads'],['arts-crafts-stationery','pens-writing']],
  'Gifts & novelty products': [['toys-games-novelty','games-novelty']],
  'Homeware & kitchenware': [['homeware-kitchen']],
  'Fashion & accessories': [['fashion-accessories']],
  'Beauty & personal care': [['beauty-personal-care']],
  'Party, events & packaging': [['events-hospitality'],['packaging']],
  'Toys, baby & children': [['toys-games-novelty']],
  'Hardware': [['hardware']],
  'Food & drinks': [['confectionery']],
};
export function matchedRegistrationInterests(selected, path) {
  if (!Array.isArray(selected) || !Array.isArray(path)) return [];
  return selected.filter(label => (INTEREST_PATHS[label] || []).some(prefix=>prefix.every((segment,index)=>path[index]===segment)));
}
export function selectPersonalisedArrivals(customer, products, { now = Date.now(), limit = 3 } = {}) {
  const maxAge=30*24*60*60*1000;
  return (Array.isArray(products) ? products : []).flatMap(product=>{
    if(!product || typeof product!=='object')return [];
    const created=Date.parse(product.created_at || '');
    const interests=matchedRegistrationInterests(customer?.product_categories,product.category_path);
    if(!interests.length || !product.code || !product.name || product.is_new!==true || product.is_archived!==false || !Number.isFinite(product.stock_on_hand) || product.stock_on_hand<=0 || !Number.isFinite(created) || created>now || now-created>maxAge)return [];
    return [{id:product.id,code:product.code,name:product.name,image_url:product.image_url || null,source:'main',selectedInterest:interests[0],matchedInterests:interests,categoryPath:product.category_path,addedToCatalogueAt:product.created_at,provenance:{basis:'registration-interest',mapping:'curated-category-path-v1',recency:'catalogue-created-at',verified:true},reason:`New in the catalogue, matching your interest in ${interests[0]}.`}];
  }).sort((a,b)=>Date.parse(b.addedToCatalogueAt)-Date.parse(a.addedToCatalogueAt)).filter((row,index,rows)=>rows.findIndex(other=>other.code===row.code)===index).slice(0,Math.max(0,Math.min(3,limit)));
}

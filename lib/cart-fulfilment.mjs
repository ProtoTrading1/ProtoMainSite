export function isMadeToOrderProduct(product) {
  return product?.availability?.state === 'to_order'
    || product?.toOrder === true
    || product?.to_order === true
    || product?.orderableWhenOutOfStock === true
    || product?.orderable_when_out_of_stock === true;
}

export function groupCartItemsByFulfilment(items = []) {
  return items.reduce((groups, item) => {
    if (isMadeToOrderProduct(item?.product)) groups.toOrder.push(item);
    else groups.available.push(item);
    return groups;
  }, { available: [], toOrder: [] });
}

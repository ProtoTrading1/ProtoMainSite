export function customerOrderStatus(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();
  const labels = {
    pending: 'Request received',
    processing: 'Being reviewed',
    confirmed: 'Confirmed',
    ready: 'Ready for collection or dispatch',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[normalized] || 'In progress';
}

export function orderVatSummary(order) {
  // Storefront unit prices and the value currently persisted in total_ex_vat
  // are VAT-inclusive despite that legacy column name.
  const subtotalInclVat = Math.max(0, Number(order?.total_ex_vat || 0));
  const discount = Math.max(0, Number(order?.discount_amount || 0));
  const totalInclVat = Math.max(0, subtotalInclVat - discount);
  return {
    subtotalInclVat,
    discount,
    totalInclVat,
    vatIncluded: totalInclVat * (15 / 115),
  };
}

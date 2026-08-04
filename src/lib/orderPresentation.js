export function customerOrderStatus(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();
  const labels = {
    pending: 'Request received',
    'handed over': 'Request received',
    'order in progress': 'Stock being confirmed',
    'order sent': 'Order confirmation sent',
    'payment received': 'Payment received',
    processing: 'Stock being confirmed',
    confirmed: 'Order confirmation sent',
    ready: 'Order update in progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[normalized] || 'In progress';
}

// These labels deliberately reflect only the workflow evidence stored on the
// order. A pro-forma, courier or collection milestone must not be inferred
// until it has a dedicated recorded event.
export function customerOrderTimeline(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();
  const current = customerOrderStatus(normalized);
  const stages = [
    { key: 'received', label: 'Request received' },
    { key: 'checking', label: 'Stock being confirmed' },
    { key: 'confirmation', label: 'Order confirmation sent' },
    { key: 'payment', label: 'Payment received' },
  ];
  const index = {
    pending: 0,
    'handed over': 0,
    'order in progress': 1,
    'order sent': 2,
    'payment received': 3,
    processing: 1,
    confirmed: 2,
  }[normalized];
  const currentIndex = Number.isInteger(index) ? index : 0;
  return stages.map((stage, stageIndex) => ({
    ...stage,
    state: stageIndex < currentIndex ? 'complete' : stageIndex === currentIndex ? 'current' : 'upcoming',
    current,
  }));
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

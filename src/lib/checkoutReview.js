const STREET_HINT = /\d|\b(?:building|centre|center|corner|cnr|estate|farm|plot|shop|stand|unit)\b/i;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getDeliveryAddressReview(customer = {}) {
  const structured = [
    clean(customer.unit_number) ? `Unit ${clean(customer.unit_number)}` : '',
    clean(customer.street_name),
    clean(customer.suburb),
    clean(customer.city),
    clean(customer.postal_code),
    clean(customer.province),
    clean(customer.country),
  ].filter(Boolean);
  const savedAddress = clean(customer.delivery_address);
  const value = savedAddress || structured.join(', ') || 'To confirm with Proto';

  const hasStructuredAddress = [
    customer.street_name,
    customer.suburb,
    customer.city,
    customer.postal_code,
  ].some((part) => clean(part));

  const complete = hasStructuredAddress
    ? Boolean(
      clean(customer.street_name)
      && clean(customer.suburb)
      && clean(customer.city)
      && clean(customer.postal_code),
    )
    : Boolean(
      savedAddress
      && savedAddress.split(',').filter((part) => clean(part)).length >= 3
      && STREET_HINT.test(savedAddress),
    );

  return {
    value,
    complete,
    warning: complete
      ? ''
      : 'This delivery address may be incomplete. Before choosing Proto delivery, add the street address, suburb and postal code in My Profile, or include the full address in your delivery notes.',
  };
}

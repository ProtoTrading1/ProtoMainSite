export const EMPTY_BILLING_PARTS = {
  street: '',
  suburb: '',
  city: '',
  province: '',
  postalCode: '',
  formatted: '',
};

export function parseGooglePlaceComponents(addressComponents) {
  const get = (type) =>
    addressComponents.find((c) => c.types.includes(type))?.long_name || '';

  const streetNumber = get('street_number');
  const route = get('route');
  const suburb = get('sublocality_level_1') || get('sublocality') || get('neighborhood');
  const city = get('locality') || get('administrative_area_level_2');
  const province = get('administrative_area_level_1');
  const postalCode = get('postal_code');

  const street = [streetNumber, route].filter(Boolean).join(' ');
  const parts = [street, suburb, city !== suburb ? city : '', province, postalCode].filter(Boolean);

  return {
    street,
    suburb,
    city,
    province,
    postalCode,
    formatted: [...new Set(parts)].join(', '),
  };
}

export function buildDeliveryAddressLine({
  streetName,
  suburb,
  city,
  postalCode,
  buildingType,
  buildingTypeOther,
  unitNumber,
  isApartments,
  isOtherBuilding,
}) {
  const parts = [streetName.trim(), suburb.trim(), city.trim(), postalCode.trim()];
  const bt = isOtherBuilding ? buildingTypeOther.trim() : buildingType;
  if (bt) parts.push(bt);
  if (isApartments && unitNumber.trim()) {
    parts.push(`Unit ${unitNumber.trim()}`);
  }
  return parts.filter(Boolean).join(', ').toUpperCase();
}

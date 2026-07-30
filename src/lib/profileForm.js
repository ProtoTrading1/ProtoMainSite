import { BUSINESS_TYPES } from './businessTypes.js';
import { buildDeliveryAddressLine } from './addressUtils.js';

// Same option sets the registration flow uses, so a profile edit can never
// produce a business type or building type the onboarding form wouldn't.
export const BUILDING_TYPES = ['Office Building', 'Apartments', 'House'];
export const SELECTABLE_BUSINESS_TYPES = BUSINESS_TYPES.filter((t) => t !== 'Other');

/**
 * Map a stored free-text value onto a dropdown. Anything the list doesn't know
 * (legacy rows, admin-typed values, the comma-joined multi-select registration
 * writes) selects "Other" and keeps the original text in the companion input,
 * so opening the page never silently rewrites what's on the account.
 */
function splitChoice(saved, options) {
  const value = String(saved || '').trim();
  if (!value) return { choice: '', other: '' };
  if (options.includes(value)) return { choice: value, other: '' };
  return { choice: 'Other', other: value };
}

export function buildProfileForm(customer) {
  const businessType = splitChoice(customer?.business_type, SELECTABLE_BUSINESS_TYPES);
  const buildingType = splitChoice(customer?.building_type, BUILDING_TYPES);
  return {
    name: customer?.name || '',
    phone: customer?.phone || '',
    business_type: businessType.choice,
    business_type_other: businessType.other,
    monthly_spend: customer?.monthly_spend || '',
    website: customer?.website || '',
    street_name: customer?.street_name || '',
    suburb: customer?.suburb || '',
    city: customer?.city || '',
    postal_code: customer?.postal_code || '',
    province: customer?.province || '',
    country: customer?.country || 'South Africa',
    building_type: buildingType.choice,
    building_type_other: buildingType.other,
    unit_number: customer?.unit_number || '',
  };
}

/**
 * Turn the form into a customers-table patch. Structured columns are what the
 * Trade Profile card and the admin portal read; `delivery_address` is the flat
 * line the order emails and packing PDFs print, so it is recomposed from the
 * same fields on every save and the two can never drift apart.
 */
export function buildProfilePatch(form) {
  const trim = (key) => String(form[key] || '').trim();
  const isSouthAfrica = trim('country') === 'South Africa';
  const isApartments = form.building_type === 'Apartments';
  const isOtherBuilding = form.building_type === 'Other';

  const patch = {
    name: trim('name'),
    phone: trim('phone'),
    business_type: (form.business_type === 'Other' ? trim('business_type_other') : trim('business_type')) || null,
    monthly_spend: trim('monthly_spend') || null,
    website: trim('website') || null,
    street_name: trim('street_name') || null,
    suburb: trim('suburb') || null,
    city: trim('city') || null,
    postal_code: trim('postal_code') || null,
    province: isSouthAfrica ? (trim('province') || null) : null,
    country: trim('country') || null,
    building_type: (isOtherBuilding ? trim('building_type_other') : trim('building_type')) || null,
    unit_number: isApartments ? (trim('unit_number') || null) : null,
  };

  const line = buildDeliveryAddressLine({
    streetName: trim('street_name'),
    suburb: trim('suburb'),
    city: trim('city'),
    postalCode: trim('postal_code'),
    buildingType: form.building_type || '',
    buildingTypeOther: trim('building_type_other'),
    unitNumber: trim('unit_number'),
    isApartments,
    isOtherBuilding,
  });
  // Never blank out a legacy free-text address just because this customer has
  // no structured fields yet — only overwrite it with something real.
  if (line) patch.delivery_address = line;

  return patch;
}

/** Address is all-or-nothing: a half-filled one produces a useless delivery label. */
export function validateProfileForm(form) {
  const parts = ['street_name', 'suburb', 'city', 'postal_code'];
  const filled = parts.filter((key) => String(form[key] || '').trim());
  if (filled.length && filled.length < parts.length) {
    return 'Please complete the full delivery address — street, suburb, city and postal code.';
  }
  if (form.business_type === 'Other' && !String(form.business_type_other || '').trim()) {
    return 'Please describe your type of business.';
  }
  if (form.building_type === 'Other' && !String(form.building_type_other || '').trim()) {
    return 'Please describe your building type.';
  }
  if (form.building_type === 'Apartments' && !String(form.unit_number || '').trim()) {
    return 'Please add your unit / apartment number.';
  }
  return '';
}

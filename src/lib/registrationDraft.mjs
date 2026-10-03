export const REGISTRATION_DRAFT_KEY = 'proto_registration_draft_v1';
const TTL = 24 * 60 * 60 * 1000;
const strings = ['companyName', 'contactName', 'vatNumber', 'email', 'phone', 'country', 'province',
  'billingStreet', 'billingSuburb', 'billingCity', 'billingPostalCode', 'streetName', 'suburb',
  'postalCode', 'city', 'buildingType', 'unitNumber', 'otherBuildingType', 'otherProductCategory',
  'businessDescription', 'monthlySpend', 'website', 'customerCode'];

export function draftFields(values) {
  const safe = {};
  for (const name of strings) safe[name] = typeof values[name] === 'string' ? values[name].slice(0, 2000) : '';
  for (const name of ['tradingChannels', 'productCategories']) {
    safe[name] = Array.isArray(values[name]) ? values[name].filter((v) => typeof v === 'string').slice(0, 30) : [];
  }
  safe.whatsappOptIn = typeof values.whatsappOptIn === 'boolean' ? values.whatsappOptIn : null;
  safe.deliverySameAsBilling = values.deliverySameAsBilling === true;
  safe.step = Number.isInteger(values.step) ? Math.max(0, Math.min(3, values.step)) : 0;
  return safe;
}

export function readRegistrationDraft(storage, now = Date.now()) {
  try {
    const draft = JSON.parse(storage.getItem(REGISTRATION_DRAFT_KEY) || 'null');
    if (!draft || !Number.isFinite(draft.at) || now - draft.at < 0 || now - draft.at > TTL) {
      storage.removeItem(REGISTRATION_DRAFT_KEY);
      return null;
    }
    return draftFields(draft.values || {});
  } catch { return null; }
}

export function saveRegistrationDraft(storage, values, now = Date.now()) {
  try {
    storage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify({ at: now, values: draftFields(values) }));
    return true;
  } catch { return false; }
}

export function clearRegistrationDraft(storage) {
  try {
    storage.removeItem(REGISTRATION_DRAFT_KEY);
    return storage.getItem(REGISTRATION_DRAFT_KEY) === null;
  } catch { return false; }
}

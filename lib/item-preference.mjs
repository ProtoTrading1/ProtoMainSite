export const MAX_ITEM_PREFERENCE_LENGTH = 240;

// A preference belongs to a basket/order line, never a shared product record.
export function normalizeItemPreference(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    const error = new Error('Preferred colour/design must be text.');
    error.status = 400;
    throw error;
  }
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (text.length > MAX_ITEM_PREFERENCE_LENGTH) {
    const error = new Error(`Preferred colour/design must be ${MAX_ITEM_PREFERENCE_LENGTH} characters or fewer.`);
    error.status = 400;
    throw error;
  }
  return text;
}

export function itemPreferenceFields(item) {
  const preference = normalizeItemPreference(item?.preference);
  return preference ? { preference } : {};
}

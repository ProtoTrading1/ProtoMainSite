import { MIN_PASSWORD_LENGTH } from './passwordPolicy.js';

// Fixed public messages only. Never render arbitrary server field text.
const fields = {
  contactName: ['Enter the contact person’s name and surname.'],
  companyName: ['Enter your company name.', 'Check your business and address details.'],
  phone: ['Enter your phone number.', 'Enter a phone number with at least 8 digits, including your area or country code.'],
  email: ['Enter your email address.'],
  password: ['Enter a password as text.', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 'Enter matching passwords.'],
  whatsappOptIn: ['Choose Yes or No for WhatsApp updates.'],
  billingStreet: ['Enter your billing address.'],
  streetName: ['Enter your delivery address.', 'Enter your delivery street name and number.'],
  country: ['Choose your country or enter its name.'],
  suburb: ['Enter your delivery suburb.'],
  postalCode: ['Enter your delivery postal code.'],
  city: ['Enter your delivery city.'],
  buildingType: ['Choose your delivery building type.'],
  unitNumber: ['Enter your unit or apartment number.', 'Check your business and address details.'],
  businessDescription: ['Describe your business using at least 20 characters.'],
  otherProductCategory: ['Name the other product category that you sell.'],
};

export function safeServerRegistrationFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([key, message]) => !Object.hasOwn(fields, key) || !fields[key].includes(message))) return null;
  return Object.fromEntries(entries);
}

import { passwordPolicyError } from '../src/lib/passwordPolicy.js';

// Validate the active form's requirements before any account lookup/create.
// Fixed messages contain no submitted values or provider details.
export function registrationFieldErrors(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const errors = {};
  const required = [
    ['contactName', 'contactName', 'Enter the contact person’s name and surname.'],
    ['businessName', 'companyName', 'Enter your company name.'],
    ['phone', 'phone', 'Enter your phone number.'],
    ['companyAddress', 'billingStreet', 'Enter your billing address.'],
    ['deliveryAddress', 'streetName', 'Enter your delivery address.'],
    ['country', 'country', 'Choose your country or enter its name.'],
    ['streetName', 'streetName', 'Enter your delivery street name and number.'],
    ['suburb', 'suburb', 'Enter your delivery suburb.'],
    ['postalCode', 'postalCode', 'Enter your delivery postal code.'],
    ['city', 'city', 'Enter your delivery city.'],
    ['buildingType', 'buildingType', 'Choose your delivery building type.'],
  ];
  for (const [input, field, message] of required) {
    if (typeof body[input] !== 'string' || !body[input].trim()) errors[field] = message;
  }
  if (!errors.phone && body.phone.replace(/\D/g, '').length < 8) errors.phone = 'Enter a phone number with at least 8 digits, including your area or country code.';
  if (typeof body.email !== 'string' || !body.email.trim()) errors.email = 'Enter your email address.';
  if (typeof body.password !== 'string') errors.password = 'Enter a password as text.';
  else if (passwordPolicyError(body.password)) errors.password = passwordPolicyError(body.password);
  if (body.confirmPassword != null && (typeof body.confirmPassword !== 'string' || body.confirmPassword !== body.password)) errors.password = 'Enter matching passwords.';
  if (typeof body.acceptWhatsapp !== 'boolean') errors.whatsappOptIn = 'Choose Yes or No for WhatsApp updates.';
  if (body.buildingType === 'Apartments' && (typeof body.unitNumber !== 'string' || !body.unitNumber.trim())) errors.unitNumber = 'Enter your unit or apartment number.';
  if (typeof body.businessDescription !== 'string' || body.businessDescription.trim().length < 20) errors.businessDescription = 'Describe your business using at least 20 characters.';
  if (body.otherProductCategory != null && typeof body.otherProductCategory !== 'string') errors.otherProductCategory = 'Name the other product category that you sell.';
  // Optional fields remain optional. Objects must not reach .trim(),
  // metadata, or email templates as applicant-provided pseudo-text.
  for (const input of ['vatNumber', 'province', 'businessType', 'website', 'customerCode', 'unitNumber', 'monthlySpend']) {
    if (body[input] != null && typeof body[input] !== 'string') errors[input === 'unitNumber' ? 'unitNumber' : 'companyName'] ||= 'Check your business and address details.';
  }
  return errors;
}

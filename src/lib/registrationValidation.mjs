import { passwordPolicyError } from './passwordPolicy.js';

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const BLOCKED_DOMAINS = new Set(['test.com', 'test.co.za', 'example.com', 'example.org', 'mailinator.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', '10minutemail.com', 'guerrillamail.com']);
const text = (value) => String(value ?? '').trim();

export const REGISTRATION_FIELD_IDS = Object.freeze({
  companyName: 'trade-company-name', contactName: 'trade-contact-name',
  email: 'trade-email', phone: 'trade-phone', password: 'trade-new-password', whatsappOptIn: 'trade-whatsapp-choice',
  country: 'trade-country', billingStreet: 'trade-billing-street', billingSuburb: 'trade-billing-suburb',
  billingCity: 'trade-billing-city', billingPostalCode: 'trade-billing-postal-code',
  streetName: 'trade-street-name', suburb: 'trade-suburb', city: 'trade-city', postalCode: 'trade-postal-code',
  buildingType: 'trade-building-type', otherBuildingType: 'trade-other-building-type', unitNumber: 'trade-unit-number',
  tradingChannels: 'landing-trading-channels', productCategories: 'landing-product-categories',
  otherProductCategory: 'landing-other-product-category', businessDescription: 'landing-business-description',
});

export const registrationErrorId = (key) => `${REGISTRATION_FIELD_IDS[key]}-error`;
export const REGISTRATION_FIELD_STEPS = Object.freeze({
  companyName: 0, contactName: 0,
  email: 1, phone: 1, password: 1, whatsappOptIn: 1,
  country: 2, billingStreet: 2, billingSuburb: 2, billingCity: 2, billingPostalCode: 2,
  streetName: 2, suburb: 2, city: 2, postalCode: 2, buildingType: 2, otherBuildingType: 2, unitNumber: 2,
  tradingChannels: 3, productCategories: 3, otherProductCategory: 3, businessDescription: 3,
});

export function validateRegistrationEmail(value) {
  const email = text(value).toLowerCase();
  if (!email) return 'Enter your email address.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address, such as name@company.co.za.';
  if (BLOCKED_DOMAINS.has(email.split('@')[1])) return 'Use your real business email address.';
  return '';
}

const EMAIL_CHECK_VALIDATION = new Map([
  ['Please enter your email address.', 'Enter your email address.'],
  ['Please enter a valid email address (e.g. name@company.co.za).', 'Enter a valid email address, such as name@company.co.za.'],
  ['Please use your real business email address - temporary or test addresses are not accepted.', 'Use your real business email address. Temporary or test addresses are not accepted.'],
  ['Please use your real business email address.', 'Use your real business email address.'],
]);

// The server's domain policy is intentionally authoritative. Recognize only
// its fixed validation responses; never display arbitrary response text.
export function registrationEmailCheckFailure(error) {
  const status = Number(error?.status);
  const fieldError = status === 400 && !error?.code ? EMAIL_CHECK_VALIDATION.get(error?.data?.error) : '';
  if (fieldError) return { kind: 'validation', fieldError, message: fieldError };
  if (status === 429) return { kind: 'rate_limit', fieldError: '', message: 'Too many email checks. Please wait before checking again. Your application has not been submitted.' };
  if (status >= 500) return { kind: 'server', fieldError: '', message: 'Email checking is temporarily unavailable. Please try again later. Your application has not been submitted.' };
  if (error?.code === 'REQUEST_TIMEOUT' || error?.name === 'RequestTimeoutError') return { kind: 'timeout', fieldError: '', message: 'The email check took too long. Check your connection, then try the check again. Your application has not been submitted.' };
  if (error?.name === 'TypeError' || status === 0) return { kind: 'network', fieldError: '', message: 'We could not connect to check your email. Check your connection, then try the check again. Your application has not been submitted.' };
  return { kind: 'unconfirmed', fieldError: '', message: 'We could not confirm the email check. Check your email address and try the check again later. Your application has not been submitted.' };
}

// These are the existing registration requirements. Optional fields stay optional.
// Return messages only: never retain, log, or return the applicant's values.
export function validateRegistrationStep(step, values = {}) {
  const errors = {};
  const required = (key, message) => { if (!text(values[key])) errors[key] = message; };
  if (step === 0) {
    required('companyName', 'Enter your company name.');
    required('contactName', 'Enter the contact person’s name and surname.');
  } else if (step === 1) {
    const emailError = validateRegistrationEmail(values.email);
    if (emailError) errors.email = emailError;
    if (!text(values.phone)) errors.phone = 'Enter your phone number.';
    else if (String(values.phone).replace(/\D/g, '').length < 8) errors.phone = 'Enter a phone number with at least 8 digits, including your area or country code.';
    if (!values.password) errors.password = 'Create a password of at least 8 characters.';
    else {
      const passwordError = passwordPolicyError(values.password);
      if (passwordError) errors.password = passwordError;
    }
    if (typeof values.whatsappOptIn !== 'boolean') errors.whatsappOptIn = 'Choose Yes or No for WhatsApp updates.';
  } else if (step === 2) {
    required('country', 'Choose your country or enter its name.');
    required('billingStreet', 'Enter your billing street name and number.');
    required('billingSuburb', 'Enter your billing suburb.');
    required('billingCity', 'Enter your billing city.');
    required('billingPostalCode', 'Enter your billing postal code.');
    required('streetName', 'Enter your delivery street name and number.');
    required('suburb', 'Enter your delivery suburb.');
    required('city', 'Enter your delivery city.');
    required('postalCode', 'Enter your delivery postal code.');
    required('buildingType', 'Choose your delivery building type.');
    if (values.buildingType === 'Other') required('otherBuildingType', 'Describe your delivery building type.');
    if (values.buildingType === 'Apartments') required('unitNumber', 'Enter your unit or apartment number.');
  } else if (step === 3) {
    if (!Array.isArray(values.tradingChannels) || values.tradingChannels.length === 0) errors.tradingChannels = 'Select at least one way that you trade.';
    if (!Array.isArray(values.productCategories) || values.productCategories.length === 0) errors.productCategories = 'Select at least one product category that you sell.';
    if (values.productCategories?.includes('Other')) required('otherProductCategory', 'Name the other product category that you sell.');
    if (!text(values.businessDescription)) errors.businessDescription = 'Describe what you sell and who you sell to, using at least 20 characters.';
    else if (text(values.businessDescription).length < 20) errors.businessDescription = 'Add more detail about your business, using at least 20 characters.';
  }
  return errors;
}

export function firstInvalidRegistrationStep(values) {
  for (let step = 0; step < 4; step += 1) {
    const errors = validateRegistrationStep(step, values);
    if (Object.keys(errors).length) return { step, errors };
  }
  return null;
}

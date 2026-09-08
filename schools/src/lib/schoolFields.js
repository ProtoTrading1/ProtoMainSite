/**
 * Field vocabulary for the school registration site.
 *
 * Every list here is mirrored by an allowlist in `api/register-school.js` — the
 * browser copy drives the UI, the server copy is what actually validates. Keep
 * the two in step when editing.
 */

export const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];

/** Chips under "Supply needs" — what the school wants to buy from Proto. */
export const SUPPLY_NEEDS = [
  'Everyday stationery',
  'Art & creative supplies',
  'Classroom essentials',
];

/** Suggestions only: the role field stays free text so nobody is forced into a
 * label that does not match how their school is actually organised. */
export const ROLE_SUGGESTIONS = [
  'Procurement officer',
  'Teacher',
  'Head of department',
  'Principal',
  'Deputy principal',
  'Bursar',
  'Finance officer',
  'School secretary',
  'SGB member',
];

export const MIN_PASSWORD_LENGTH = 8;

export function passwordPolicyError(password) {
  return String(password || '').length < MIN_PASSWORD_LENGTH
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    : '';
}

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const BLOCKED_DOMAINS = [
  'test.com', 'test.co.za', 'example.com', 'example.org', 'mailinator.com',
  'tempmail.com', 'temp-mail.org', 'yopmail.com', '10minutemail.com', 'guerrillamail.com',
];

export function emailError(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'Please enter your work email address.';
  if (!EMAIL_RE.test(v)) return 'Please enter a valid email address (e.g. name@school.co.za).';
  if (BLOCKED_DOMAINS.includes(v.split('@')[1])) return 'Please use your real school email address.';
  return '';
}

export function phoneError(value) {
  return String(value || '').replace(/\D/g, '').length < 8
    ? 'Please enter a contact number of at least 8 digits.'
    : '';
}

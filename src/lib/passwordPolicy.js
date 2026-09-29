export const MIN_PASSWORD_LENGTH = 10;
export const PASSWORD_REQUIREMENTS_TEXT = `Use at least ${MIN_PASSWORD_LENGTH} characters and avoid common or easy-to-guess passwords.`;

export function passwordPolicyError(password) {
  return String(password || '').length < MIN_PASSWORD_LENGTH
    ? `Please redo your password. ${PASSWORD_REQUIREMENTS_TEXT}`
    : '';
}

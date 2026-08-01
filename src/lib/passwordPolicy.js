export const MIN_PASSWORD_LENGTH = 8;

export function passwordPolicyError(password) {
  return String(password || '').length < MIN_PASSWORD_LENGTH
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    : '';
}

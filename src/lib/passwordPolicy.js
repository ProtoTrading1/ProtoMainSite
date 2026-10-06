export const MIN_PASSWORD_LENGTH = 10;
export const PASSWORD_STRENGTH_GUIDANCE = 'This password is too weak. Please choose a stronger, unique password.';

export function passwordPolicyError(password) {
  return String(password || '').length < MIN_PASSWORD_LENGTH
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    : '';
}

export function validateSignInFields(email, password, { mode = 'login' } = {}) {
  const errors = {};
  const trimmed = String(email || '').trim();
  if (!trimmed) errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
    errors.email = 'Enter a valid email address, for example name@business.co.za.';
  }
  // Existing passwords are checked by Auth. Registration password rules must
  // not prevent a returning customer from using their existing password.
  if (mode === 'login' && !password) errors.password = 'Enter your password.';
  return errors;
}

const PRIVATE_SIGN_IN_MESSAGE = 'We could not sign you in with those details. Check your email and password. New to online ordering? Register for online access. If you may already have an account, use Forgot password.';

// Only fixed messages derived from stable codes/statuses reach the UI. Raw
// provider messages can contain personal data or reveal account existence.
export function signInFailureMessage(error, { operation = 'login' } = {}) {
  const code = String(error?.code || '').toLowerCase();
  const status = Number(error?.status);
  const timeout = ['request_timeout', 'sign_in_timeout'].includes(code)
    || ['RequestTimeoutError', 'TimeoutError'].includes(error?.name);
  const network = status === 0 || ['TypeError', 'AuthRetryableFetchError'].includes(error?.name)
    || ['network_error', 'fetch_error'].includes(code);
  if (status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(code)) {
    return 'Too many requests. Please wait a few minutes before trying again.';
  }
  if (operation !== 'login') {
    const request = operation === 'resend' ? 'confirmation email' : 'password reset';
    if (timeout || network) {
      return `We could not confirm whether your ${request} request was received. Check your inbox and spam folder before requesting another link.`;
    }
    return `We could not confirm your ${request} request. Please try again later. If you already requested a link, check your inbox and spam folder first.`;
  }
  if (timeout) return 'Sign-in took too long. Check your connection, then try again.';
  if (status >= 500) return 'Sign-in is temporarily unavailable. Please try again later.';
  if (network) return 'We could not connect to sign in. Check your connection, then try again.';
  if (['sign_in_session_changed', 'sign_in_commit_failed', 'sign_in_invalid_session', 'auth_identity_changed'].includes(code)) {
    return 'We could not finish sign-in safely. Reload this page before trying again.';
  }
  if (code === 'email_not_confirmed') {
    return 'If you recently registered, confirm your email using the link in your inbox before signing in. You can request another confirmation email below.';
  }
  if (['pending_approval', 'not_approved', 'account_pending_approval'].includes(code)) {
    return 'Online trade access requires approval. If you have already applied, check your email for the approval update before signing in.';
  }
  return PRIVATE_SIGN_IN_MESSAGE;
}

export function isConfirmedSignInSession(session) {
  return Boolean(session && typeof session.user?.id === 'string' && session.user.id.trim()
    && typeof session.access_token === 'string' && session.access_token.trim()
    && typeof session.refresh_token === 'string' && session.refresh_token.trim());
}

export function confirmedRecoveryMessage(result, operation) {
  if (result?.ok !== true) {
    const error = new Error('Recovery request was not confirmed.');
    error.code = 'INVALID_RESPONSE';
    throw error;
  }
  return operation === 'resend'
    ? 'Request received. If your application needs email confirmation, check your inbox and spam folder for a new link.'
    : 'Request received. If an online account exists for this email, check your inbox and spam folder for a reset link.';
}

// A synchronous gate prevents two submits in the same React render. Identity
// checks suppress late responses after dismissal, mode changes or a retry.
export function createSignInAttemptGuard() {
  let current = null;
  return {
    isBusy() { return current !== null; },
    begin() {
      if (current) return null;
      current = { controller: new AbortController(), committing: false };
      return current;
    },
    isCurrent(attempt) {
      return current === attempt && !attempt.controller.signal.aborted;
    },
    commit(attempt) {
      if (current !== attempt || attempt.controller.signal.aborted) return false;
      attempt.committing = true;
      return true;
    },
    finish(attempt) {
      if (current !== attempt) return false;
      current = null;
      return true;
    },
    cancel() {
      if (current?.committing) return false;
      current?.controller.abort();
      current = null;
      return true;
    },
  };
}

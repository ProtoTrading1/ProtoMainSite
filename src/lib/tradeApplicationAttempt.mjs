import { submitTradeApplication } from './tradeApplication.js';
import { MIN_PASSWORD_LENGTH, PASSWORD_STRENGTH_GUIDANCE } from './passwordPolicy.js';
import { safeServerRegistrationFields } from './registrationServerGuidance.mjs';

const ATTEMPT_KEY = 'proto.trade-application-attempt.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNKNOWN_MESSAGE = 'We could not confirm whether your application was received. Check your inbox and spam folder, then use Sign in or Forgot password if you may already have registered. To avoid submitting twice, this page will not send another application.';
const SAFE_VALIDATION = new Map([
  ['Please complete all required fields', {}],
  ['Please select at least one way that you trade.', { tradingChannels: 'Select at least one way that you trade.' }],
  ['Please select at least one product category.', { productCategories: 'Select at least one product category that you sell.' }],
  ['Please name the other product category.', { otherProductCategory: 'Name the other product category that you sell.' }],
  ['Please describe your business in at least 20 characters.', { businessDescription: 'Describe your business using at least 20 characters.' }],
  ['Passwords do not match.', { password: 'Enter matching passwords.' }],
  [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, { password: `Create a password of at least ${MIN_PASSWORD_LENGTH} characters.` }],
  ['Please enter your email address.', { email: 'Enter your email address.' }],
  ['Please enter a valid email address (e.g. name@company.co.za).', { email: 'Enter a valid email address.' }],
  ['Please use your real business email address - temporary or test addresses are not accepted.', { email: 'Use your real business email address.' }],
  ['Please use your real business email address.', { email: 'Use your real business email address.' }],
]);

function attemptError(message, code, { retrySafe = false, fieldErrors = {} } = {}) {
  return Object.assign(new Error(message), { code, retrySafe, outcomeUnknown: !retrySafe, fieldErrors });
}

export function isConfirmedTradeApplication(result) {
  if (result?.receipt === 'CHECK_EMAIL_OR_SIGN_IN') {
    return result.ok === true && result.instantAccess === false && result.emailVerificationRequired === true;
  }
  // Accept the previous endpoint envelope during a rolling release. The UI
  // uses neutral guidance for both versions, never account/mail delivery claims.
  return result?.ok === true && result.instantAccess === false
    && result.emailVerificationRequired === true && typeof result.verificationEmailSent === 'boolean'
    && typeof result.profile?.id === 'string' && UUID.test(result.profile.id);
}

// Only status + a fixed, known pre-account response permits another POST.
// A definite weak-password rejection also permits explicit correction.
// Other provider failures, 5xx, aborted/lost bodies and malformed success
// envelopes cannot establish whether an account was already created.
export function applicationFailure(error) {
  const status = Number(error?.status);
  if (status === 422 && error?.code === 'REGISTRATION_PASSWORD_REJECTED'
      && error?.data?.error === 'Choose a stronger password before submitting again.') {
    const fieldErrors = safeServerRegistrationFields(error.data.fieldErrors);
    if (fieldErrors && Object.keys(fieldErrors).length === 1 && fieldErrors.password === PASSWORD_STRENGTH_GUIDANCE) {
      return attemptError('Choose a stronger password before submitting again. Your other details are still here.', 'REGISTRATION_PASSWORD_REJECTED', { retrySafe: true, fieldErrors });
    }
  }
  if (status === 400 && error?.code === 'REGISTRATION_VALIDATION_FAILED'
      && error?.data?.error === 'Check the highlighted application details.') {
    const fieldErrors = safeServerRegistrationFields(error.data.fieldErrors);
    if (fieldErrors) return attemptError('Check the highlighted details before submitting again. Your other entries are still here; enter your password again.', 'REGISTRATION_VALIDATION_FAILED', { retrySafe: true, fieldErrors });
  }
  if (status === 409 && error?.code === 'EMAIL_ALREADY_REGISTERED') {
    return Object.assign(attemptError('An online account may already use these details. Use Sign in or Forgot password to continue.', 'EMAIL_ALREADY_REGISTERED', { retrySafe: true }), { recovery: 'SIGN_IN_OR_RESET_PASSWORD' });
  }
  if (status === 400 && !error?.code && SAFE_VALIDATION.has(error?.data?.error)) {
    return attemptError('Check the highlighted details before submitting again. Your other entries are still here; enter your password again.', 'REGISTRATION_VALIDATION_FAILED', { retrySafe: true, fieldErrors: SAFE_VALIDATION.get(error.data.error) });
  }
  if (status === 429 && !error?.code && ['Too many registration attempts. Please try again later.', 'Too many registration attempts for this email. Please try again later.'].includes(error?.data?.error)) {
    return attemptError('Too many registration attempts. Please wait before trying again. Your other entries are still here; enter your password again.', 'REGISTRATION_RATE_LIMITED', { retrySafe: true });
  }
  if (status === 503 && !error?.code && ['Registration email is temporarily unavailable. Please try again later.', 'Registration is temporarily unavailable. Please try again later.'].includes(error?.data?.error)) {
    return attemptError('Registration is temporarily unavailable. Please try again later. Your other entries are still here; enter your password again.', 'REGISTRATION_UNAVAILABLE', { retrySafe: true });
  }
  return attemptError(UNKNOWN_MESSAGE, 'REGISTRATION_OUTCOME_UNKNOWN');
}

export function createTradeApplicationAttempt({ send = submitTradeApplication, storage } = {}) {
  if (storage === undefined) {
    try { storage = globalThis.sessionStorage; } catch { storage = null; }
  }
  let state = 'idle';
  let controller = null;
  try {
    // Any existing marker, including an interrupted pending request, needs
    // recovery. This journal intentionally stores no customer information.
    if (storage?.getItem(ATTEMPT_KEY) != null) state = 'unknown';
  } catch { state = 'unknown'; }
  const journal = (value) => {
    if (!storage) return false;
    try {
      if (value === 'idle' || value === 'confirmed') storage.removeItem(ATTEMPT_KEY);
      else {
        storage.setItem(ATTEMPT_KEY, value);
        if (storage.getItem(ATTEMPT_KEY) !== value) return false;
      }
      return true;
    } catch { return false; }
  };
  return {
    get state() { return state; },
    async submit(payload) {
      if (state === 'idle') {
        try { if (storage?.getItem(ATTEMPT_KEY) != null) state = 'unknown'; }
        catch { state = 'unknown'; }
      }
      if (state === 'pending') throw attemptError('Your application is still being checked. Please wait.', 'REGISTRATION_PENDING', { retrySafe: true });
      if (state === 'unknown') throw attemptError(UNKNOWN_MESSAGE, 'REGISTRATION_OUTCOME_UNKNOWN');
      if (state === 'confirmed') throw attemptError('Your application has already been received. Check your email for the next step.', 'REGISTRATION_CONFIRMED');
      // Set the gate before the first await. Refuse to send if interruption
      // protection cannot be recorded in this browser.
      state = 'pending';
      if (!journal('pending')) {
        state = 'unknown';
        throw attemptError('This browser could not safely remember your application status. No application was sent. Enable session storage or use another browser before applying.', 'REGISTRATION_STORAGE_UNAVAILABLE');
      }
      controller = new AbortController();
      try {
        const result = await send(payload, { signal: controller.signal });
        if (controller.signal.aborted || !isConfirmedTradeApplication(result)) throw attemptError(UNKNOWN_MESSAGE, 'REGISTRATION_OUTCOME_UNKNOWN');
        state = 'confirmed';
        journal('confirmed');
        return result;
      } catch (error) {
        const failure = applicationFailure(error);
        state = failure.retrySafe && !controller.signal.aborted ? 'idle' : 'unknown';
        if (!journal(state) && state === 'idle') state = 'unknown';
        if (state === 'unknown') throw attemptError(UNKNOWN_MESSAGE, 'REGISTRATION_OUTCOME_UNKNOWN');
        throw failure;
      } finally { controller = null; }
    },
    cancel() {
      if (state !== 'pending') return;
      state = 'unknown';
      journal('unknown');
      controller?.abort();
    },
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, X } from 'lucide-react';
import { resetPassword, resendTradeVerification, signIn } from '../lib/auth';
import { trackJourneyEvent } from '../lib/journeyAnalytics';
import {
  confirmedRecoveryMessage, createSignInAttemptGuard, isConfirmedSignInSession,
  signInFailureMessage, validateSignInFields,
} from '../lib/signInGuidance.mjs';
import ProtoLogo from './ProtoLogo';
import './LoginModal.css';

export default function LoginModal({ onLogin, onClose, onApply, initialEmail = '', initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode === 'forgot' ? 'forgot' : 'login');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [activeOperation, setActiveOperation] = useState('login');
  const backdropRef = useRef(null);
  const cardRef = useRef(null);
  const summaryRef = useRef(null);
  const mouseDownOrigin = useRef(null);
  const attempts = useRef(createSignInAttemptGuard());
  const mounted = useRef(true);

  const clearPassword = () => { setPassword(''); setShowPw(false); };
  const focusSummary = () => window.requestAnimationFrame(() => summaryRef.current?.focus());
  const closeLogin = useCallback(() => {
    if (!attempts.current.cancel()) return;
    setPassword(''); setShowPw(false);
    onClose();
  }, [onClose]);
  const changeMode = (next) => {
    if (!attempts.current.cancel()) return;
    clearPassword();
    setMode(next); setError(''); setInfo(''); setFieldErrors({});
    setLoading(false); setCommitting(false);
    window.requestAnimationFrame(() => cardRef.current?.querySelector('#login-email')?.focus());
  };

  useEffect(() => {
    mounted.current = true;
    const gate = attempts.current;
    return () => { mounted.current = false; gate.cancel(); };
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeLogin(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(cardRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const initialFrame = window.requestAnimationFrame(() => {
      if (!cardRef.current?.contains(document.activeElement)) cardRef.current?.querySelector('input')?.focus();
    });
    return () => {
      window.cancelAnimationFrame(initialFrame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [closeLogin]);

  const performRequest = async (operation) => {
    if (attempts.current.isBusy()) return;
    const fields = validateSignInFields(email, password, { mode: operation === 'login' ? 'login' : 'forgot' });
    if (Object.keys(fields).length) {
      clearPassword();
      setFieldErrors(fields); setError(''); setInfo(''); focusSummary();
      return;
    }
    const attempt = attempts.current.begin();
    if (!attempt) return;
    const currentAttempt = () => mounted.current && attempts.current.isCurrent(attempt);
    setActiveOperation(operation);
    setFieldErrors({}); setError(''); setInfo(''); setLoading(true);
    if (operation !== 'login') clearPassword();
    try {
      if (operation === 'login') {
        const result = await signIn(email.trim(), password, {
          signal: attempt.controller.signal,
          onCommit: () => {
            if (attempts.current.commit(attempt) && mounted.current) setCommitting(true);
          },
        });
        if (!currentAttempt()) return;
        if (!isConfirmedSignInSession(result?.session)) {
          const incomplete = new Error('Sign-in did not confirm a session.');
          incomplete.code = 'SIGN_IN_COMMIT_FAILED';
          throw incomplete;
        }
        clearPassword();
        // A valid committed session, rather than a bare response, is required
        // before the parent can open the customer's account.
        trackJourneyEvent('login_succeeded', { journey: 'authentication', outcome: 'success' });
        await onLogin(result.session);
      } else {
        const result = operation === 'resend'
          ? await resendTradeVerification(email.trim(), { signal: attempt.controller.signal })
          : await resetPassword(email.trim(), { signal: attempt.controller.signal });
        if (!currentAttempt()) return;
        setInfo(confirmedRecoveryMessage(result, operation));
        if (operation === 'forgot') {
          trackJourneyEvent('password_reset_requested', { journey: 'authentication', outcome: 'accepted' });
        }
      }
    } catch (failure) {
      if (!currentAttempt()) return;
      clearPassword();
      setError(signInFailureMessage(failure, { operation })); focusSummary();
      trackJourneyEvent(operation === 'forgot' ? 'password_reset_failed' : 'login_failed', {
        journey: 'authentication', outcome: 'error',
      });
    } finally {
      if (attempts.current.finish(attempt) && mounted.current) {
        setCommitting(false); setLoading(false);
      }
    }
  };

  const updateField = (field, value) => {
    if (field === 'email') setEmail(value);
    else setPassword(value);
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous }; delete next[field]; return next;
    });
    setError(''); setInfo('');
  };
  const hasErrors = Boolean(error || Object.keys(fieldErrors).length);

  return (
    <div
      className="lm-backdrop" ref={backdropRef}
      onMouseDown={(event) => { mouseDownOrigin.current = event.target; }}
      onClick={() => { if (mouseDownOrigin.current === backdropRef.current) closeLogin(); }}
    >
      <div className="lm-card" ref={cardRef} role="dialog" aria-modal="true"
        aria-labelledby="login-modal-heading" onClick={(event) => event.stopPropagation()}>
        <button className="lm-close" type="button" onClick={closeLogin} aria-label="Close sign-in" disabled={committing}>
          <X size={18} aria-hidden="true" />
        </button>
        <div className="lm-brand"><ProtoLogo variant="full" size="lg" tagline={false} /></div>
        <div className="lm-heading">
          <h2 id="login-modal-heading">{mode === 'forgot' ? 'Reset password.' : 'Welcome back.'}</h2>
          <p>{mode === 'forgot' ? 'Enter the email you use for online ordering.' : 'Sign in to your online trade account.'}</p>
        </div>
        {hasErrors && (
          <div id="login-modal-error" className="lm-alert lm-alert-err" role="alert" tabIndex={-1}
            ref={summaryRef} aria-labelledby="login-modal-error-heading">
            <strong id="login-modal-error-heading">{Object.keys(fieldErrors).length ? 'Check the highlighted fields.'
              : activeOperation === 'forgot' ? 'Reset request not confirmed.'
                : activeOperation === 'resend' ? 'Confirmation request not confirmed.' : 'Sign-in not completed.'}</strong>
            {error && <p>{error}</p>}
            {Object.keys(fieldErrors).length > 0 && (
              <ul>{Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}><button type="button" className="lm-alert-link" onClick={() => {
                  cardRef.current?.querySelector(`#login-${field}`)?.focus();
                }}>{message}</button></li>
              ))}</ul>
            )}
          </div>
        )}
        {info && <div id="login-modal-info" className="lm-alert lm-alert-ok" role="status">{info}</div>}
        <form className="lm-form" noValidate aria-busy={loading}
          onSubmit={(event) => { event.preventDefault(); void performRequest(mode); }}>
          <div className="lm-field">
            <label htmlFor="login-email">Email address</label>
            <div className="lm-input-wrap">
              <Mail size={16} className="lm-input-icon" aria-hidden="true" />
              <input id="login-email" name="email" type="email" inputMode="email" autoComplete="email"
                autoCapitalize="none" spellCheck={false} value={email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="name@business.co.za" readOnly={loading} required aria-required="true"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={[fieldErrors.email && 'login-email-error', info && 'login-modal-info'].filter(Boolean).join(' ') || undefined} />
            </div>
            {fieldErrors.email && <p className="lm-field-error" id="login-email-error">{fieldErrors.email}</p>}
          </div>
          {mode === 'login' && (
            <div className="lm-field">
              <div className="lm-label-row">
                <label htmlFor="login-password">Password</label>
                <button type="button" className="lm-forgot-link" disabled={committing} onClick={() => changeMode('forgot')}>
                  Forgot password?
                </button>
              </div>
              <div className="lm-input-wrap">
                <Lock size={16} className="lm-input-icon" aria-hidden="true" />
                <input id="login-password" name="password" type={showPw ? 'text' : 'password'}
                  autoComplete="current-password" value={password}
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder="Enter your password" readOnly={loading} required aria-required="true"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined} />
                <button type="button" className="lm-eye" disabled={loading} onClick={() => setShowPw((value) => !value)}
                  aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                  {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
              {fieldErrors.password && <p className="lm-field-error" id="login-password-error">{fieldErrors.password}</p>}
            </div>
          )}
          <button type="submit" className="lm-submit" disabled={loading}>
            {loading ? (activeOperation === 'forgot' ? 'Requesting reset link...'
              : activeOperation === 'resend' ? 'Requesting confirmation...' : 'Signing in...')
              : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
          </button>
        </form>
        {mode === 'forgot' && (
          <button type="button" className="lm-toggle" disabled={committing} onClick={() => changeMode('login')}>
            Back to sign in
          </button>
        )}
        {mode === 'login' && (
          <button type="button" className="lm-toggle" disabled={loading}
            onClick={() => { void performRequest('resend'); }}>Resend confirmation email</button>
        )}
        {onApply && (
          <div className="lm-account-options" aria-label="Other account options">
            <p><strong>New customer?</strong> Register for online access.</p>
            <p>Bought from Proto before without an online account? Register for this website too.</p>
            <button type="button" className="lm-apply-link" disabled={committing} onClick={() => {
              if (!attempts.current.cancel()) return;
              clearPassword(); onApply();
            }}>Register for online access</button>
          </div>
        )}
        <div className="lm-note"><ShieldCheck size={13} aria-hidden="true" />
          B2B wholesale - online trade access requires approval
        </div>
      </div>
    </div>
  );
}

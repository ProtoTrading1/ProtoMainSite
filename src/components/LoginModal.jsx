import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, X } from 'lucide-react';
import { resetPassword, signIn } from '../lib/auth';
import { trackJourneyEvent } from '../lib/journeyAnalytics';
import ProtoLogo from './ProtoLogo';

export default function LoginModal({ onLogin, onClose, onApply, initialEmail = '', initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode === 'forgot' ? 'forgot' : 'login');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const backdropRef = useRef(null);
  const cardRef = useRef(null);
  const mouseDownOrigin = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(cardRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => cardRef.current?.querySelector('input')?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'forgot') {
        if (!email) { setError('Enter your email address.'); setLoading(false); return; }
        await resetPassword(email);
        setInfo('If an online account exists for that email, we’ll send a reset link. Check your inbox and spam folder.');
        trackJourneyEvent('password_reset_requested', { journey: 'authentication', outcome: 'accepted' });
      } else {
        if (!email || !password) { setError('Please enter your email and password.'); setLoading(false); return; }
        const { session } = await signIn(email, password);
        if (session) {
          trackJourneyEvent('login_succeeded', { journey: 'authentication', outcome: 'success' });
          await onLogin(session);
        }
      }
    } catch (err) {
      const raw = err?.message || 'Authentication failed.';
      // Email confirmation was removed — accounts are gated by ADMIN APPROVAL.
      // Supabase can still answer "Email not confirmed" for an account created
      // before that change, and a pending account is not an error the customer
      // can act on, so both read as "we are still reviewing you".
      setError(/email not confirmed|not confirmed|pending approval|not approved/i.test(raw)
        ? 'Proto is still reviewing your application. We will notify you when you have been approved.'
        : raw);
      trackJourneyEvent(mode === 'forgot' ? 'password_reset_failed' : 'login_failed', {
        journey: 'authentication',
        outcome: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="lm-backdrop"
      ref={backdropRef}
      onMouseDown={(e) => { mouseDownOrigin.current = e.target; }}
      onClick={() => { if (mouseDownOrigin.current === backdropRef.current) onClose(); }}
    >
      <div
        className="lm-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-heading"
        onClick={(event) => event.stopPropagation()}
      >
          {/* Close */}
          <button className="lm-close" type="button" onClick={onClose} aria-label="Close sign-in">
            <X size={18} aria-hidden="true" />
          </button>

          {/* Brand */}
          <div className="lm-brand">
            <ProtoLogo variant="full" size="lg" tagline={false} />
          </div>

          {/* Heading */}
          <div className="lm-heading">
            <h2 id="login-modal-heading">{mode === 'forgot' ? 'Reset password.' : 'Welcome back.'}</h2>
            <p>{mode === 'forgot' ? 'Enter your email and we\'ll send a reset link.' : 'Sign in to your trade account.'}</p>
          </div>

          {/* Alerts */}
          {error && <div id="login-modal-error" className="lm-alert lm-alert-err" role="alert">{error}</div>}
          {info  && <div id="login-modal-info" className="lm-alert lm-alert-ok" role="status">{info}</div>}

          {/* Form */}
          <form className="lm-form" onSubmit={handleSubmit}>
            <div className="lm-field">
              <label htmlFor="login-email">Email address</label>
              <div className="lm-input-wrap">
                <Mail size={16} className="lm-input-icon" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.co.za"
                  autoFocus
                  aria-describedby={[error && 'login-modal-error', info && 'login-modal-info'].filter(Boolean).join(' ') || undefined}
                  required
                  aria-required="true"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div className="lm-field">
                <div className="lm-label-row">
                  <label htmlFor="login-password">Password</label>
                  {mode === 'login' && (
                    <button type="button" className="lm-forgot-link" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="lm-input-wrap">
                  <Lock size={16} className="lm-input-icon" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    aria-required="true"
                  />
                  <button
                    type="button"
                    className="lm-eye"
                    onClick={() => setShowPw(s => !s)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw
                      ? <EyeOff size={16} aria-hidden="true" />
                      : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="lm-submit" disabled={loading}>
              {loading
                ? (mode === 'forgot' ? 'Sending…' : 'Signing in…')
                : mode === 'forgot' ? 'Send reset link'
                : 'Sign in'}
            </button>
          </form>

          {/* Back to login link when in forgot mode */}
          {mode === 'forgot' && (
            <button type="button" className="lm-toggle" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
              ← Back to sign in
            </button>
          )}

          {/* Apply link */}
          {mode === 'login' && onApply && (
            <div className="lm-account-options" aria-label="Other account options">
              <p><strong>Bought from Proto before, but not online?</strong> Re-register for the new website.</p>
              <p><strong>New trade customer?</strong> Apply for online trade access.</p>
              <button type="button" className="lm-apply-link" onClick={onApply}>
                Re-register or apply
              </button>
            </div>
          )}

          {/* Footer note */}
          <div className="lm-note">
            <ShieldCheck size={13} />
            B2B wholesale — accounts require admin approval
          </div>
      </div>
    </div>
  );
}

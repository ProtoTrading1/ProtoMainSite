import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, X } from 'lucide-react';
import { resetPassword, signIn } from '../lib/auth';
import ProtoLogo from './ProtoLogo';

export default function LoginModal({ onLogin, onClose, onApply }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const backdropRef = useRef(null);
  const mouseDownOrigin = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'forgot') {
        if (!email) { setError('Enter your email address.'); setLoading(false); return; }
        await resetPassword(email);
        setInfo('Password reset email sent. Check your inbox.');
        setMode('login');
      } else {
        if (!email || !password) { setError('Please enter your email and password.'); setLoading(false); return; }
        const { session } = await signIn(email, password);
        if (session) await onLogin(session);
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="lm-backdrop"
      ref={backdropRef}
      onMouseDown={(e) => { mouseDownOrigin.current = e.target; }}
      onClick={(e) => { if (mouseDownOrigin.current === backdropRef.current) onClose(); }}
    >
      <div className="lm-card" onClick={(e) => e.stopPropagation()}>
          {/* Close */}
          <button className="lm-close" type="button" onClick={onClose}>
            <X size={18} />
          </button>

          {/* Brand */}
          <div className="lm-brand">
            <ProtoLogo variant="full" size="lg" tagline={false} />
          </div>

          {/* Heading */}
          <div className="lm-heading">
            <h2>{mode === 'forgot' ? 'Reset password.' : 'Welcome back.'}</h2>
            <p>{mode === 'forgot' ? 'Enter your email and we\'ll send a reset link.' : 'Log in to your trade account.'}</p>
          </div>

          {/* Alerts */}
          {error && <div className="lm-alert lm-alert-err">{error}</div>}
          {info  && <div className="lm-alert lm-alert-ok">{info}</div>}

          {/* Form */}
          <form className="lm-form" onSubmit={handleSubmit}>
            <div className="lm-field">
              <label>Email address</label>
              <div className="lm-input-wrap">
                <Mail size={16} className="lm-input-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.co.za"
                  autoFocus
                  required
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div className="lm-field">
                <div className="lm-label-row">
                  <label>Password</label>
                  {mode === 'login' && (
                    <button type="button" className="lm-forgot-link" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="lm-input-wrap">
                  <Lock size={16} className="lm-input-icon" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" className="lm-eye" onClick={() => setShowPw(s => !s)}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="lm-submit" disabled={loading}>
              {loading
                ? (mode === 'forgot' ? 'Sending…' : 'Signing in…')
                : mode === 'forgot' ? 'Send reset link'
                : 'Log in'}
            </button>
          </form>

          {/* Back to login link when in forgot mode */}
          {mode === 'forgot' && (
            <button type="button" className="lm-toggle" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
              ← Back to login
            </button>
          )}

          {/* Apply link */}
          {mode === 'login' && onApply && (
            <button type="button" className="lm-apply-link" onClick={onApply}>
              New to Proto Trading? Apply for access ↓
            </button>
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

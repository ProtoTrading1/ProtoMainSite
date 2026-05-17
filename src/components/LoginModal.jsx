import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, X } from 'lucide-react';
import { resetPassword, signIn, signUp } from '../lib/auth';

export default function LoginModal({ onLogin, onClose, onApply }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

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
        if (mode === 'login') {
          const { session } = await signIn(email, password);
          if (session) await onLogin(session);
        } else {
          await signUp(email, password, name);
          setInfo('Account created. Check your email to confirm, then log in.');
          setMode('login');
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); };

  return (
    <AnimatePresence>
      <motion.div
        className="lm-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
      >
        <motion.div
          className="lm-card"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button className="lm-close" type="button" onClick={onClose}>
            <X size={18} />
          </button>

          {/* Brand */}
          <div className="lm-brand">
            <img src="/proto-logo.png" alt="Proto Trading" className="lm-logo" />
            <div>
              <strong>PROTO <span>TRADING</span></strong>
              <small>Trade portal</small>
            </div>
          </div>

          {/* Heading */}
          <div className="lm-heading">
            <h2>{mode === 'login' ? 'Welcome back.' : mode === 'forgot' ? 'Reset password.' : 'Create account.'}</h2>
            <p>{mode === 'login' ? 'Log in to your trade account.' : mode === 'forgot' ? 'Enter your email and we\'ll send a reset link.' : 'Register for trade portal access.'}</p>
          </div>

          {/* Alerts */}
          {error && <div className="lm-alert lm-alert-err">{error}</div>}
          {info  && <div className="lm-alert lm-alert-ok">{info}</div>}

          {/* Form */}
          <form className="lm-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="lm-field">
                <label>Business / Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name or business name"
                  autoFocus
                />
              </div>
            )}

            <div className="lm-field">
              <label>Email address</label>
              <div className="lm-input-wrap">
                <Mail size={16} className="lm-input-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.co.za"
                  autoFocus={mode === 'login' || mode === 'forgot'}
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
                : mode === 'login' ? 'Log in'
                : mode === 'forgot' ? 'Send reset link'
                : 'Create account'}
            </button>
          </form>

          {/* Divider */}
          <div className="lm-divider"><span>or</span></div>

          {/* Toggle mode / back */}
          {mode === 'forgot' ? (
            <button type="button" className="lm-toggle" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
              ← Back to login
            </button>
          ) : (
            <button type="button" className="lm-toggle" onClick={switchMode}>
              {mode === 'login' ? 'No account? Request trade access' : 'Already have an account? Log in'}
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

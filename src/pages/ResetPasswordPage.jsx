import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import ProtoLogo from '../components/ProtoLogo';
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';
import { trackJourneyEvent } from '../lib/journeyAnalytics';
import './ResetPasswordPage.css';

export default function ResetPasswordPage({ token, recoverySession = false, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenState, setTokenState] = useState(recoverySession ? 'valid' : token ? 'checking' : 'invalid');
  const [error, setError] = useState(recoverySession || token ? '' : 'This reset link is missing or invalid. Request a new one from sign in.');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (recoverySession || !token) return undefined;

    fetch('/api/validate-reset-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.valid) throw new Error(data.error || 'This reset link is no longer valid.');
        if (!cancelled) setTokenState('valid');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setTokenState('invalid');
          trackJourneyEvent('password_reset_failed', {
            journey: 'authentication',
            step: 'link_validation',
            outcome: 'invalid_link',
          });
        }
      });

    return () => { cancelled = true; };
  }, [token, recoverySession]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const policyError = passwordPolicyError(password);
    if (policyError) { setError(policyError); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      if (recoverySession) {
        const { supabase } = await import('../lib/supabase');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
        if (signOutError) throw signOutError;
      } else {
        const res = await fetch('/api/do-reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Password reset failed.');
      }
      setDone(true);
      trackJourneyEvent('password_reset_completed', {
        journey: 'authentication',
        step: 'password_update',
        outcome: 'success',
      });
    } catch (err) {
      setError(err.message);
      trackJourneyEvent('password_reset_failed', {
        journey: 'authentication',
        step: 'password_update',
        outcome: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="reset-password-page">
      <section className="reset-password-card" aria-labelledby="reset-password-heading">
        <div className="reset-password-accent" />
        <div className="reset-password-body">
          <ProtoLogo variant="full" size="md" tagline={false} className="reset-password-logo" />

          {done ? (
            <div className="reset-password-result">
              <div className="reset-password-result-icon" aria-hidden="true">✓</div>
              <h1 id="reset-password-heading">Password updated</h1>
              <p>Your password has been changed. Sign in again on every device using the new password.</p>
              <button type="button" className="reset-password-primary" onClick={onDone}>Back to sign in</button>
            </div>
          ) : (
            <>
              <h1 id="reset-password-heading">Set new password</h1>
              <p className="reset-password-intro">Use at least {MIN_PASSWORD_LENGTH} characters for your Proto Trading Online account.</p>

              {tokenState === 'checking' && (
                <div className="reset-password-status" role="status">Checking your reset link…</div>
              )}

              {error && (
                <div id="reset-password-error" className="reset-password-error" role="alert">{error}</div>
              )}

              {tokenState === 'valid' ? (
                <form onSubmit={submit} className="reset-password-form">
                  <div className="reset-password-field">
                    <label htmlFor="reset-new-password">New password</label>
                    <div className="reset-password-input-wrap">
                      <Lock size={16} aria-hidden="true" />
                      <input
                        id="reset-new-password"
                        name="new-password"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        minLength={MIN_PASSWORD_LENGTH}
                        aria-describedby={error ? 'reset-password-requirements reset-password-error' : 'reset-password-requirements'}
                        autoFocus
                        required
                      />
                      <button
                        type="button"
                        className="reset-password-reveal"
                        onClick={() => setShowPw((shown) => !shown)}
                        aria-label={showPw ? 'Hide new password' : 'Show new password'}
                        aria-pressed={showPw}
                      >
                        {showPw ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                    <span id="reset-password-requirements" className="reset-password-hint">Minimum {MIN_PASSWORD_LENGTH} characters</span>
                  </div>

                  <div className="reset-password-field">
                    <label htmlFor="reset-confirm-password">Confirm password</label>
                    <div className="reset-password-input-wrap">
                      <Lock size={16} aria-hidden="true" />
                      <input
                        id="reset-confirm-password"
                        name="confirm-password"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        placeholder="Repeat password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                      />
                      <button
                        type="button"
                        className="reset-password-reveal"
                        onClick={() => setShowConfirm((shown) => !shown)}
                        aria-label={showConfirm ? 'Hide confirmed password' : 'Show confirmed password'}
                        aria-pressed={showConfirm}
                      >
                        {showConfirm ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="reset-password-primary" disabled={loading}>
                    {loading ? 'Updating…' : 'Set new password'}
                  </button>
                </form>
              ) : tokenState === 'invalid' ? (
                <button type="button" className="reset-password-primary" onClick={onDone}>Back to sign in</button>
              ) : null}

              <div className="reset-password-note">
                <ShieldCheck size={13} aria-hidden="true" />
                Reset links expire after 15 minutes and can only be used once.
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

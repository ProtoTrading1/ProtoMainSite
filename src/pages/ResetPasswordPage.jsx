import { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

export default function ResetPasswordPage({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/do-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,0.55)' }}>
        <div style={{ height: '6px', background: '#c40000' }} />
        <div style={{ padding: '40px 36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <img src="/proto-logo.png" alt="Proto Trading" style={{ height: '32px' }} />
            <div>
              <div style={{ fontWeight: '900', fontSize: '16px', color: '#fff', fontFamily: 'Outfit, sans-serif' }}>
                PROTO <span style={{ color: '#c40000' }}>TRADING</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Trade portal</div>
            </div>
          </div>

          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
              <h2 style={{ color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: '900', margin: '0 0 12px' }}>Password updated</h2>
              <p style={{ color: '#94a3b8', margin: '0 0 28px', lineHeight: 1.6 }}>Your password has been changed successfully.</p>
              <button onClick={onDone} style={{ width: '100%', padding: '14px', background: '#c40000', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '800', fontSize: '15px', cursor: 'pointer' }}>
                Back to login
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: '900', margin: '0 0 8px', fontSize: '26px' }}>Set new password</h2>
              <p style={{ color: '#64748b', margin: '0 0 28px', fontSize: '14px', lineHeight: 1.5 }}>Enter a new password for your account.</p>

              {error && (
                <div style={{ background: 'rgba(196,0,0,0.12)', border: '1px solid rgba(196,0,0,0.3)', color: '#ff6b6b', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>New password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      autoFocus
                      required
                      style={{ width: '100%', boxSizing: 'border-box', padding: '12px 44px', background: '#1a1a2e', border: '1.5px solid #2a2a3a', borderRadius: '10px', color: '#fff', fontSize: '15px', outline: 'none' }}
                    />
                    <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Confirm password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      required
                      style={{ width: '100%', boxSizing: 'border-box', padding: '12px 44px', background: '#1a1a2e', border: '1.5px solid #2a2a3a', borderRadius: '10px', color: '#fff', fontSize: '15px', outline: 'none' }}
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading} style={{ padding: '14px', background: '#c40000', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '800', fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '4px' }}>
                  {loading ? 'Updating…' : 'Set new password'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '24px', color: '#475569', fontSize: '12px' }}>
                <ShieldCheck size={13} />
                B2B wholesale — accounts require admin approval
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

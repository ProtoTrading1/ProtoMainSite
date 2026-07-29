import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { signIn, signUp } from '../lib/auth';
import ProtoLogo from '../components/ProtoLogo';

export default function LoginPage({ onLogin, onBack }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setError(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'login') {
        const { session } = await signIn(email, password);
        if (session) onLogin(session);
      } else {
        await signUp(email, password, name);
        setInfo('Account created. Proto is reviewing your application — we will notify you when you have been approved.');
        setMode('login');
      }
    } catch (err) {
      const raw = err?.message || 'Authentication failed.';
      // Email confirmation was removed — accounts are gated by admin approval
      // instead. Any lingering "not confirmed" response from Supabase (e.g. an
      // account created before that change) should read as pending review.
      setError(/email not confirmed|not confirmed/i.test(raw)
        ? 'Proto is still reviewing your application. We will notify you when you have been approved.'
        : raw);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-deep)', fontFamily: 'Inter, sans-serif' }}>
      <header className="landing-header" style={{ position: 'static', backgroundColor: 'transparent', borderBottom: 'none' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-white-muted)', fontSize: '14px', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={18} /> Back
          </button>
          <ProtoLogo variant="full" size="md" tagline={false} />
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
              <Lock size={28} color="var(--proto-red)" />
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#fff', marginBottom: '8px', letterSpacing: '-1px', fontFamily: 'Outfit' }}>
              {mode === 'login' ? 'Portal Login' : 'Request Access'}
            </h1>
            <p style={{ fontSize: '16px', color: 'var(--text-white-muted)', fontWeight: '500' }}>
              {mode === 'login' ? 'Access the trade ordering system.' : 'Register for trade portal access.'}
            </p>
          </div>

          {error && (
            <div style={{ backgroundColor: 'rgba(225,29,72,0.1)', border: '1px solid rgba(225,29,72,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', fontSize: '14px', color: '#fca5a5' }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', fontSize: '14px', color: '#86efac' }}>
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="premium-form-group">
                <label className="premium-label" style={{ color: 'var(--text-white-muted)' }}>Business / Name</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Your name or business name"
                  className="premium-input"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>
            )}

            <div className="premium-form-group">
              <label className="premium-label" style={{ color: 'var(--text-white-muted)' }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.com" className="premium-input"
                  style={{ paddingLeft: '48px', backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  required
                />
              </div>
            </div>

            <div className="premium-form-group">
              <label className="premium-label" style={{ color: 'var(--text-white-muted)' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" className="premium-input"
                  style={{ paddingLeft: '48px', paddingRight: '48px', backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-white-muted)', padding: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-premium" style={{ width: '100%', padding: '16px', fontSize: '16px', marginTop: '8px' }}>
              {loading ? 'Authenticating…' : mode === 'login' ? 'Log In to Trade Portal' : 'Request Access'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', margin: '24px 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', fontWeight: '800' }}>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>

          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
            className="btn-outline" style={{ width: '100%', padding: '14px' }}>
            {mode === 'login' ? 'No account? Request trade access' : 'Already have an account? Log in'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '24px' }}>
            <ShieldCheck size={16} color="rgba(255,255,255,0.2)" />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', fontWeight: '500' }}>B2B Wholesale — Accounts require admin approval</span>
          </div>
        </div>
      </div>
    </div>
  );
}

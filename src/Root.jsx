import { useCallback, useEffect, useRef, useState } from 'react';
import App from './App';
import LandingPage from './pages/LandingPage';
import LoginModal from './components/LoginModal';
import ProfilePage from './pages/ProfilePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import WorldClassPortal from './worldclass/WorldClassPortal';
import { getCustomerProfile, onAuthChange, signOut } from './lib/auth';
import { supabase } from './lib/supabase';

export default function Root() {
  const [session, setSession] = useState(undefined);
  const [customer, setCustomer] = useState(null);
  const [view, setView] = useState(() => window.sessionStorage.getItem('proto-surface') || 'landing');
  const [route, setRoute] = useState(window.location.hash);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  // Nonce: each loadCustomer call increments this; stale completions are ignored.
  // Replaces the old boolean lock that blocked login when a stale-session fetch
  // was in-flight (e.g. token refresh on regular-tab load with old cookies).
  const loadNonce = useRef(0);

  useEffect(() => {
    const handler = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const setSurface = useCallback((next) => {
    setView(next);
    if (['portal', 'admin', 'profile', 'login', 'landing'].includes(next)) {
      window.sessionStorage.setItem('proto-surface', next);
    }
  }, []);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const area = document.querySelector('.content-area');
    if (area) area.scrollTop = 0;
  }, [view]);

  const loadCustomer = useCallback(async (userId) => {
    const nonce = ++loadNonce.current;
    const profile = await getCustomerProfile(userId);
    if (nonce !== loadNonce.current) return; // a newer call started — discard this result
    setCustomer(profile);
    if (!profile) return;
    if (profile.is_approved || profile.role === 'admin') {
      setSurface('portal');
      return;
    }
    setView('pending');
  }, [setSurface]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session?.user) {
        void loadCustomer(data.session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
        return;
      }
      setSession(sess ?? null);
      if (sess?.user) {
        await loadCustomer(sess.user.id);
      } else {
        setCustomer(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadCustomer]);

  const handleLogin = async (sess) => {
    setSession(sess);
    await loadCustomer(sess.user.id);
  };

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setCustomer(null);
    window.sessionStorage.removeItem('proto-surface');
    setView('landing');
    window.location.hash = '';
  };

  if (route.startsWith('#/worldclass')) return <WorldClassPortal />;
  if (route.startsWith('#/portal-preview')) return <App customer={null} onLogout={handleLogout} />;

  if (passwordRecovery) {
    return (
      <ResetPasswordPage
        token={null}
        onDone={() => {
          setPasswordRecovery(false);
          window.location.hash = '';
          setSurface('login');
        }}
      />
    );
  }

  if (route.startsWith('#/reset-password')) {
    const params = new URLSearchParams(route.replace('#/reset-password?', '').replace('#/reset-password', ''));
    const token = params.get('token');
    return (
      <ResetPasswordPage
        token={token}
        onDone={() => {
          window.location.hash = '';
          setSurface('login');
        }}
      />
    );
  }

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505' }}>
        <div style={{ color: '#e11d48', fontSize: '14px' }}>Loading…</div>
      </div>
    );
  }

  if (session && customer && !customer.is_approved && customer.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f1f5f9', fontFamily: 'Inter, sans-serif', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>⏳</div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>Account Pending Approval</h1>
        <p style={{ color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
          Your trade account is pending admin approval. You will be notified once approved.
        </p>
        <button onClick={handleLogout} style={{ padding: '10px 24px', background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
          Log Out
        </button>
      </div>
    );
  }

  if (session && view === 'profile') {
    return (
      <ProfilePage
        customer={customer}
        onBack={() => setSurface('portal')}
        onProfileUpdate={(updated) => setCustomer(updated)}
      />
    );
  }

  if (session && (view === 'portal' || view === 'admin')) {
    return (
      <App
        customer={customer}
        onLogout={handleLogout}
        onViewProfile={() => setSurface('profile')}
        onViewAdmin={null}
      />
    );
  }

  const scrollToApply = () => {
    setSurface('landing');
    setTimeout(() => {
      document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  return (
    <>
      <LandingPage
        onLogin={() => setSurface('login')}
        onApply={() => {
          const el = document.getElementById('lp-apply');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      {view === 'login' && (
        <LoginModal
          onLogin={handleLogin}
          onClose={() => setSurface('landing')}
          onApply={() => { setSurface('landing'); scrollToApply(); }}
        />
      )}
    </>
  );
}

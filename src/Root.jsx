import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import PortalErrorBoundary from './components/PortalErrorBoundary';
import LandingPage from './pages/LandingPage';

const App = lazy(() => import('./App'));
const LoginModal = lazy(() => import('./components/LoginModal'));
const PoliciesPage = lazy(() => import('./pages/PoliciesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const WorldClassPortal = lazy(() => import('./worldclass/WorldClassPortal'));

export default function Root() {
  const [session, setSession] = useState(undefined);
  const [customer, setCustomer] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [view, setView] = useState('landing');
  const [route, setRoute] = useState(window.location.hash);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const authBootstrapped = useRef(false);
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
    if (next === 'landing') {
      window.sessionStorage.removeItem('proto-surface');
      return;
    }
    if (next === 'profile') {
      window.sessionStorage.setItem('proto-surface', next);
    }
  }, []);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const area = document.querySelector('.content-area');
    if (area) area.scrollTop = 0;
  }, [view]);

  const loadCustomer = useCallback(async (userId, sessionOrToken = null) => {
    const nonce = ++loadNonce.current;
    setCustomerLoading(true);
    try {
      const { getCustomerProfile } = await import('./lib/auth');
      const profile = await getCustomerProfile(userId, sessionOrToken);
      if (nonce !== loadNonce.current) return; // a newer call started — discard this result
      setCustomer(profile);
      if (!profile) return;
      if (profile.is_approved || profile.role === 'admin') {
        setSurface('portal');
        return;
      }
      setView('pending');
    } finally {
      if (nonce === loadNonce.current) {
        setCustomerLoading(false);
      }
    }
  }, [setSurface]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const finishBootstrap = (sess) => {
      authBootstrapped.current = true;
      setSession(sess ?? null);
      if (sess?.user) {
        void loadCustomer(sess.user.id, sess);
      } else {
        setCustomerLoading(false);
        setCustomer(null);
      }
    };

    const bootstrapTimer = window.setTimeout(() => {
      if (!authBootstrapped.current) {
        setSession(null);
      }
    }, 3500);

    (async () => {
      try {
        const { supabase } = await import('./lib/supabase');
        if (cancelled) return;

        supabase.auth.getSession()
          .then(({ data }) => {
            if (!cancelled) finishBootstrap(data.session ?? null);
          })
          .catch(() => {
            if (!cancelled) finishBootstrap(null);
          });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
          if (event === 'PASSWORD_RECOVERY') {
            setPasswordRecovery(true);
            return;
          }
          authBootstrapped.current = true;
          clearTimeout(bootstrapTimer);
          setSession(sess ?? null);
          if (sess?.user) {
            await loadCustomer(sess.user.id, sess);
          } else {
            setCustomerLoading(false);
            setCustomer(null);
          }
        });

        unsubscribe = () => subscription.unsubscribe();
      } catch {
        if (!cancelled) finishBootstrap(null);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(bootstrapTimer);
      unsubscribe();
    };
  }, [loadCustomer]);

  const handleLogin = async (sess) => {
    setSession(sess);
    await loadCustomer(sess.user.id, sess);
  };

  const handleLogout = async () => {
    const { signOut } = await import('./lib/auth');
    await signOut();
    setSession(null);
    setCustomer(null);
    setCustomerLoading(false);
    window.sessionStorage.removeItem('proto-surface');
    setView('landing');
    window.location.hash = '';
  };

  const authSurfaceFallback = (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#e11d48', fontSize: '14px', fontWeight: '700', marginBottom: '8px' }}>Loading portal…</div>
        <div style={{ color: '#94a3b8', fontSize: '13px' }}>Preparing your account view.</div>
      </div>
    </div>
  );

  if (route.startsWith('#/policies')) return <Suspense fallback={authSurfaceFallback}><PoliciesPage onLogin={() => setSurface('login')} /></Suspense>;
  if (route.startsWith('#/worldclass')) return <Suspense fallback={authSurfaceFallback}><WorldClassPortal /></Suspense>;
  if (route.startsWith('#/portal-preview')) return <Suspense fallback={authSurfaceFallback}><App customer={null} onLogout={handleLogout} /></Suspense>;

  if (passwordRecovery) {
    return (
      <Suspense fallback={authSurfaceFallback}>
        <ResetPasswordPage
          token={null}
          onDone={() => {
            setPasswordRecovery(false);
            window.location.hash = '';
            setSurface('login');
          }}
        />
      </Suspense>
    );
  }

  if (route.startsWith('#/reset-password')) {
    const params = new URLSearchParams(route.replace('#/reset-password?', '').replace('#/reset-password', ''));
    const token = params.get('token');
    return (
      <Suspense fallback={authSurfaceFallback}>
        <ResetPasswordPage
          token={token}
          onDone={() => {
            window.location.hash = '';
            setSurface('login');
          }}
        />
      </Suspense>
    );
  }

  if (session === undefined && ['portal', 'admin', 'profile'].includes(view)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505' }}>
        <div style={{ color: '#e11d48', fontSize: '14px' }}>Loading…</div>
      </div>
    );
  }

  if (session && customerLoading && (view === 'portal' || view === 'admin' || view === 'profile' || !customer)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#e11d48', fontSize: '14px', fontWeight: '700', marginBottom: '8px' }}>Signing you in…</div>
          <div style={{ color: '#94a3b8', fontSize: '13px' }}>Loading your account and catalogue.</div>
        </div>
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
      <Suspense fallback={authSurfaceFallback}>
        <ProfilePage
          customer={customer}
          onBack={() => setSurface('portal')}
          onProfileUpdate={(updated) => setCustomer(updated)}
        />
      </Suspense>
    );
  }

  if (session && (view === 'portal' || view === 'admin')) {
    return (
      <PortalErrorBoundary>
        <Suspense fallback={authSurfaceFallback}>
          <App
            customer={customer}
            onLogout={handleLogout}
            onViewProfile={() => setSurface('profile')}
            onViewAdmin={null}
          />
        </Suspense>
      </PortalErrorBoundary>
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
        <Suspense fallback={null}>
          <LoginModal
            onLogin={handleLogin}
            onClose={() => setSurface('landing')}
            onApply={() => { setSurface('landing'); scrollToApply(); }}
          />
        </Suspense>
      )}
    </>
  );
}

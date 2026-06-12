import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import PortalErrorBoundary from './components/PortalErrorBoundary';
import LandingPage from './pages/LandingPage';
import lazyWithRetry from './lib/lazyWithRetry';
import { isAdminHost } from './lib/isAdminHost';
import { scrollToTop } from './lib/scrollToTop';

const App = lazyWithRetry(() => import('./App'), 'root-app');
const LoginModal = lazyWithRetry(() => import('./components/LoginModal'), 'root-login-modal');
const PoliciesPage = lazyWithRetry(() => import('./pages/PoliciesPage'), 'root-policies-page');
const ProfilePage = lazyWithRetry(() => import('./pages/ProfilePage'), 'root-profile-page');
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'), 'root-reset-password-page');
const WorldClassPortal = lazyWithRetry(() => import('./worldclass/WorldClassPortal'), 'root-worldclass-portal');

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://protoportal-main.vercel.app';

export default function Root() {
  const adminHost = isAdminHost();
  const [session, setSession] = useState(undefined);
  const [customer, setCustomer] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [view, setView] = useState('landing');
  const [route, setRoute] = useState(window.location.hash);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const authBootstrapped = useRef(false);
  const loadNonce = useRef(0);

  useEffect(() => {
    if (adminHost) document.title = 'Proto Admin';
  }, [adminHost]);

  // Browsers (esp. Chrome) try to "restore" the previous scroll position
  // when the user navigates back, forward, or — combined with our hash
  // routing — sometimes when arriving at a new page. That manifests as
  // pages loading scrolled to the bottom. Opt out of the heuristic so we
  // can drive scroll explicitly on every route change.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    try {
      const prev = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
      return () => { window.history.scrollRestoration = prev; };
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setRoute(window.location.hash);
      scrollToTop();
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const setSurface = useCallback((next) => {
    setView(next);
    if (next === 'landing') {
      window.sessionStorage.removeItem('proto-surface');
      return;
    }
    if (['profile', 'admin'].includes(next)) {
      window.sessionStorage.setItem('proto-surface', next);
    }
  }, []);

  useEffect(() => {
    scrollToTop();
  }, [view]);

  const loadCustomer = useCallback(async (userId, sessionOrToken = null) => {
    const nonce = ++loadNonce.current;
    setCustomerLoading(true);
    try {
      const { getCustomerProfile } = await import('./lib/auth');
      const profile = await getCustomerProfile(userId, sessionOrToken);
      if (nonce !== loadNonce.current) return;
      setCustomer(profile);
      if (!profile) return;

      if (adminHost) {
        if (profile.role === 'admin') setSurface('admin');
        else setView('admin-denied');
        return;
      }

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
  }, [adminHost, setSurface]);

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

  if (!adminHost && route.startsWith('#/policies')) return <Suspense fallback={authSurfaceFallback}><PoliciesPage onLogin={() => setSurface('login')} /></Suspense>;
  if (!adminHost && route.startsWith('#/worldclass')) return <Suspense fallback={authSurfaceFallback}><WorldClassPortal /></Suspense>;
  if (!adminHost && route.startsWith('#/portal-preview')) return <Suspense fallback={authSurfaceFallback}><App customer={null} onLogout={handleLogout} /></Suspense>;

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

  if (session && customerLoading && !customer) {
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

  if (adminHost && session && view === 'admin-denied') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f1f5f9', fontFamily: 'Inter, sans-serif', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🔒</div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>Admin access only</h1>
        <p style={{ color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
          This dashboard is restricted to admin accounts.
        </p>
        <a href={PORTAL_URL} style={{ padding: '10px 24px', background: '#8B1A1A', color: '#fff', borderRadius: '8px', fontWeight: '600', textDecoration: 'none' }}>
          Go to trade portal
        </a>
        <button type="button" onClick={handleLogout} style={{ padding: '10px 24px', background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
          Log out
        </button>
      </div>
    );
  }

  // The embedded admin dashboard is deprecated — admin lives in the separate
  // protoportal-admin app. Send admins there instead of rendering anything here.
  if (adminHost && session && customer?.role === 'admin' && view === 'admin') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f1f5f9', fontFamily: 'Inter, sans-serif', gap: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>Admin has moved</h1>
        <p style={{ color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
          The admin dashboard now lives at protoportal-admin.vercel.app.
        </p>
        <a href="https://protoportal-admin.vercel.app" style={{ padding: '10px 24px', background: '#8B1A1A', color: '#fff', borderRadius: '8px', fontWeight: '600', textDecoration: 'none' }}>
          Open admin dashboard
        </a>
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

  if (session && view === 'portal') {
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

  if (adminHost) {
    const showLogin = session === null || view === 'login';
    return (
      <>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#e11d48', fontSize: '14px', fontWeight: '700', marginBottom: '8px' }}>Proto Admin</div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>
              {session === undefined ? 'Loading…' : showLogin ? 'Sign in to open the dashboard.' : 'Loading dashboard…'}
            </div>
          </div>
        </div>
        {showLogin && session !== undefined && (
          <Suspense fallback={null}>
            <LoginModal
              onLogin={handleLogin}
              onClose={() => {}}
              onApply={() => {}}
            />
          </Suspense>
        )}
      </>
    );
  }

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

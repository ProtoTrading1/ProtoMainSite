import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import PortalErrorBoundary from './components/PortalErrorBoundary';
import LandingPage from './pages/LandingPage';
import lazyWithRetry from './lib/lazyWithRetry';
import { isAdminHost } from './lib/isAdminHost';
import { getPortalUrl, isPreRegisterHost } from './lib/isPreRegisterHost';
import { scrollToTop } from './lib/scrollToTop';
import { setMonitoringUser } from './lib/monitoring';
import {
  identifyIntercom,
  refreshIntercomIdentity,
  resetIntercom,
  setIntercomLauncherVisibility,
} from './lib/intercom';
import { hasStoredSession, isSessionExpired } from './lib/sessionPolicy';
import { rememberAuthSession } from './lib/authHeaders';

const App = lazyWithRetry(() => import('./App'), 'root-app');
const LoginModal = lazyWithRetry(() => import('./components/LoginModal'), 'root-login-modal');
const PoliciesPage = lazyWithRetry(() => import('./pages/PoliciesPage'), 'root-policies-page');
const ProfilePage = lazyWithRetry(() => import('./pages/ProfilePage'), 'root-profile-page');
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'), 'root-reset-password-page');
const WorldClassPortal = lazyWithRetry(() => import('./worldclass/WorldClassPortal'), 'root-worldclass-portal');

const PORTAL_URL = getPortalUrl();

export default function Root() {
  const adminHost = isAdminHost();
  const preRegisterHost = isPreRegisterHost();
  const [session, setSession] = useState(undefined);
  const [customer, setCustomer] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [view, setView] = useState('landing');
  const [route, setRoute] = useState(window.location.hash);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [requestedReorder, setRequestedReorder] = useState(null);
  const [loginOptions, setLoginOptions] = useState({ initialEmail: '', initialMode: 'login' });
  const authBootstrapped = useRef(false);
  const loadNonce = useRef(0);

  useEffect(() => {
    setRequestedReorder(null);
  }, [session?.user?.id]);

  useEffect(() => {
    if (adminHost) document.title = 'Proto Admin';
    else if (preRegisterHost) document.title = 'Proto Trading — Trade Registration';
  }, [adminHost, preRegisterHost]);

  useEffect(() => {
    if (!preRegisterHost) return;
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setRoute('');
    }
    if (pathname !== '/') {
      window.history.replaceState(null, '', '/');
      setPathname('/');
    }
  }, [preRegisterHost, pathname]);

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
    const shouldRootScrollOnHash = (hash) => {
      if (!hash) return true;
      return hash.startsWith('#/policies')
        || hash.startsWith('#/worldclass')
        || hash.startsWith('#/reset-password');
    };

    const onHashChange = () => {
      if (preRegisterHost && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
      setRoute(window.location.hash);
      if (shouldRootScrollOnHash(window.location.hash)) {
        scrollToTop();
      }
    };
    const onPopState = () => {
      setPathname(window.location.pathname);
      scrollToTop();
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onPopState);
    };
  }, [preRegisterHost]);

  const isPreRegisterRoute = !adminHost && !preRegisterHost && pathname === '/pre-register';

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

  const openLogin = useCallback((options = {}) => {
    setLoginOptions({
      initialEmail: String(options?.initialEmail || '').trim(),
      initialMode: options?.initialMode === 'forgot' ? 'forgot' : 'login',
    });
    setSurface('login');
  }, [setSurface]);

  const closeLogin = useCallback(() => {
    setLoginOptions({ initialEmail: '', initialMode: 'login' });
    setSurface('landing');
  }, [setSurface]);

  useEffect(() => {
    scrollToTop();
  }, [view]);

  useEffect(() => {
    // The launcher belongs to signed-in customers. It used to be hidden on
    // exactly the surfaces they use (portal, profile) and shown only on public
    // pages, which is why a logged-in customer never saw a chat button.
    // `session !== undefined` only meant "auth has resolved" — it was true for
    // signed-out visitors too.
    const showLauncher = Boolean(session) && !adminHost && !preRegisterHost;
    setIntercomLauncherVisibility(showLauncher);
  }, [adminHost, preRegisterHost, route, session, view]);

  const loadCustomer = useCallback(async (userId, sessionOrToken = null) => {
    const nonce = ++loadNonce.current;
    setCustomerLoading(true);
    try {
      const { getCustomerProfile } = await import('./lib/auth');
      const profile = await getCustomerProfile(userId, sessionOrToken);
      if (nonce !== loadNonce.current) return;
      setCustomer(profile);
      setMonitoringUser(profile);
      if (!profile) return;

      if (adminHost) {
        if (profile.role === 'admin') setSurface('admin');
        else setView('admin-denied');
        return;
      }

      if (preRegisterHost) {
        if (!profile.is_approved && profile.role !== 'admin') setView('pending');
        return;
      }

      if (profile.is_approved || profile.role === 'admin') {
        void import('./lib/products').then((m) => m.prefetchCatalog());
        setSurface('portal');
        return;
      }
      setView('pending');
    } finally {
      if (nonce === loadNonce.current) {
        setCustomerLoading(false);
      }
    }
  }, [adminHost, preRegisterHost, setSurface]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const finishBootstrap = (sess) => {
      authBootstrapped.current = true;
      rememberAuthSession(sess);
      setSession(sess ?? null);
      if (sess?.user) {
        void import('./lib/products').then((m) => m.prefetchCatalog());
        void loadCustomer(sess.user.id, sess);
        // Hand Intercom a signed identity so Fin's catalogue connector can
        // trust the email it receives. No-ops if the account isn't approved.
        void identifyIntercom(sess);
      } else {
        setCustomerLoading(false);
        setCustomer(null);
      }
    };

    // Give up and show the logged-out surface if auth never settles. A stored
    // session gets a longer grace period: refreshing an expired access token is
    // a network round-trip, and flashing the landing page at a signed-in
    // customer mid-restore is worse than a moment more of the loading state.
    const bootstrapTimer = window.setTimeout(() => {
      if (!authBootstrapped.current) {
        setSession(null);
      }
    }, hasStoredSession() ? 12000 : 3500);

    (async () => {
      try {
        const { supabase } = await import('./lib/supabase');
        if (cancelled) return;

        // Sessions now survive a refresh, so something has to end them: a
        // sign-in older than the 30-day window is discarded on sight.
        const withinPolicy = (sess) => {
          if (!sess || !isSessionExpired(sess)) return sess ?? null;
          void supabase.auth.signOut().catch(() => {});
          return null;
        };

        supabase.auth.getSession()
          .then(({ data }) => {
            if (!cancelled) finishBootstrap(withinPolicy(data.session));
          })
          .catch(() => {
            if (!cancelled) finishBootstrap(null);
          });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, rawSession) => {
          if (event === 'PASSWORD_RECOVERY') {
            setPasswordRecovery(true);
            return;
          }
          const sess = withinPolicy(rawSession);
          authBootstrapped.current = true;
          clearTimeout(bootstrapTimer);
          rememberAuthSession(sess);
          setSession(sess);
          if (sess?.user) {
            if (event === 'TOKEN_REFRESHED') {
              // Keep the signed Intercom identity alive on long-lived tabs
              // without tearing down an open conversation.
              void refreshIntercomIdentity(sess);
            } else {
              void identifyIntercom(sess);
            }
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
    setLoginOptions({ initialEmail: '', initialMode: 'login' });
    rememberAuthSession(sess);
    setSession(sess);
    try { sessionStorage.removeItem('proto_welcome_dismissed'); } catch { /* ignore */ }
    void import('./lib/products').then((m) => m.prefetchCatalog());
    void identifyIntercom(sess);
    await loadCustomer(sess.user.id, sess);
  };

  const handleLogout = async () => {
    const { signOut } = await import('./lib/auth');
    await signOut();
    const { invalidateProductCache } = await import('./lib/products');
    invalidateProductCache();
    // Drop the Intercom contact too, or the next person on this browser
    // inherits the signed-out customer's identity — and their trade prices.
    resetIntercom();
    rememberAuthSession(null);
    setSession(null);
    setCustomer(null);
    setCustomerLoading(false);
    setMonitoringUser(null);
    setRequestedReorder(null);
    setLoginOptions({ initialEmail: '', initialMode: 'login' });
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

  const registrationLanding = (
    <>
      <LandingPage
        registrationMode
        onLogin={openLogin}
        onApply={() => {
          document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      {view === 'login' && (
        <Suspense fallback={null}>
          <LoginModal
            onLogin={handleLogin}
            onClose={closeLogin}
            initialEmail={loginOptions.initialEmail}
            initialMode={loginOptions.initialMode}
            onApply={() => {
              closeLogin();
              window.requestAnimationFrame(() => {
                document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' });
              });
            }}
          />
        </Suspense>
      )}
    </>
  );

  if (preRegisterHost) {
    if (session === undefined) return authSurfaceFallback;

    if (session && customerLoading && !customer) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#e11d48', fontSize: '14px', fontWeight: '700', marginBottom: '8px' }}>Signing you in…</div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>Checking your account.</div>
          </div>
        </div>
      );
    }

    if (session && customer && (customer.is_approved || customer.role === 'admin')) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f1f5f9', fontFamily: 'Inter, sans-serif', gap: '16px', padding: '24px' }}>
          <div style={{ fontSize: '48px' }}>✓</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'Outfit, sans-serif', margin: 0 }}>Your account is ready</h1>
          <p style={{ color: '#64748b', maxWidth: '420px', textAlign: 'center', margin: 0 }}>
            Your trade account is live. We’ll notify you as soon as the site is launched.
          </p>
          <button type="button" onClick={handleLogout} style={{ padding: '10px 24px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      );
    }

    if (session && customer && !customer.is_approved && customer.role !== 'admin') {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#f1f5f9', fontFamily: 'Inter, sans-serif', gap: '16px' }}>
          <div style={{ fontSize: '48px' }}>⏳</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'Outfit, sans-serif' }}>Account Pending Approval</h1>
          <p style={{ color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
            Proto is still reviewing your application. We will notify you when you have been approved.
          </p>
          <button type="button" onClick={handleLogout} style={{ padding: '10px 24px', background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
            Log Out
          </button>
        </div>
      );
    }

    return registrationLanding;
  }

  if (isPreRegisterRoute) {
    if (session === undefined) return authSurfaceFallback;
    if (!session) return registrationLanding;
  }

  if (!adminHost && route.startsWith('#/policies')) return <Suspense fallback={authSurfaceFallback}><PoliciesPage onLogin={openLogin} /></Suspense>;
  if (!adminHost && route.startsWith('#/worldclass')) return <Suspense fallback={authSurfaceFallback}><WorldClassPortal /></Suspense>;
  if (passwordRecovery) {
    return (
      <Suspense fallback={authSurfaceFallback}>
        <ResetPasswordPage
          token={null}
          recoverySession
          onDone={() => {
            setPasswordRecovery(false);
            window.location.hash = '';
            setLoginOptions({ initialEmail: '', initialMode: 'login' });
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
            setLoginOptions({ initialEmail: '', initialMode: 'login' });
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
          Proto is still reviewing your application. We will notify you when you have been approved.
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
          onReorderOrder={(order) => {
            setRequestedReorder({
              id: order.id,
              order_number: order.order_number,
              items: (order.items || []).map((item) => ({
                productId: item.productId,
                code: item.code,
                qty: item.qty,
              })),
            });
            setSurface('portal');
          }}
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
            requestedReorder={requestedReorder}
            onRequestedReorderHandled={() => setRequestedReorder(null)}
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
              initialEmail={loginOptions.initialEmail}
              initialMode={loginOptions.initialMode}
            />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <>
      <LandingPage
        onLogin={openLogin}
        onApply={() => {
          const el = document.getElementById('lp-apply');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      {view === 'login' && (
        <Suspense fallback={null}>
          <LoginModal
            onLogin={handleLogin}
            onClose={closeLogin}
            onApply={() => { closeLogin(); scrollToApply(); }}
            initialEmail={loginOptions.initialEmail}
            initialMode={loginOptions.initialMode}
          />
        </Suspense>
      )}
    </>
  );
}

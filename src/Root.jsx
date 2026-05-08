import React, { useEffect, useState } from 'react';
import App from './App';
import AdminPage from './pages/AdminPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import WorldClassPortal from './worldclass/WorldClassPortal';
import { getCustomerProfile, onAuthChange, signOut } from './lib/auth';
import { supabase } from './lib/supabase';

export default function Root() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [customer, setCustomer] = useState(null);
  const [view, setView] = useState('landing'); // 'landing' | 'login' | 'portal' | 'admin' | 'profile'
  const [route, setRoute] = useState(window.location.hash);

  // Sync hash changes
  useEffect(() => {
    const handler = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Bootstrap auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session?.user) loadCustomer(data.session.user.id);
    });

    const { data: { subscription } } = onAuthChange(async (sess) => {
      setSession(sess ?? null);
      if (sess?.user) {
        await loadCustomer(sess.user.id);
      } else {
        setCustomer(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadCustomer(userId) {
    const profile = await getCustomerProfile(userId);
    setCustomer(profile);
    if (profile) {
      if (profile.is_approved || profile.role === 'admin') setView('portal');
      else setView('pending');
    }
  }

  const handleLogin = async (sess) => {
    setSession(sess);
    await loadCustomer(sess.user.id);
  };

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setCustomer(null);
    setView('landing');
    window.location.hash = '';
  };

  // Special routes
  if (route.startsWith('#/worldclass')) return <WorldClassPortal />;
  if (route.startsWith('#/portal-preview')) return <App customer={null} onLogout={handleLogout} />;

  // Loading
  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505' }}>
        <div style={{ color: '#e11d48', fontSize: '14px' }}>Loading…</div>
      </div>
    );
  }

  // Logged in — pending approval
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

  // Admin panel
  if (session && customer?.role === 'admin' && view === 'admin') {
    return <AdminPage customer={customer} onLogout={handleLogout} onViewPortal={() => setView('portal')} />;
  }

  // Profile page
  if (session && view === 'profile') {
    return (
      <ProfilePage
        customer={customer}
        onBack={() => setView('portal')}
        onProfileUpdate={(updated) => setCustomer(updated)}
      />
    );
  }

  // Portal
  if (session && (view === 'portal' || view === 'admin')) {
    return (
      <App
        customer={customer}
        onLogout={handleLogout}
        onViewProfile={() => setView('profile')}
        onViewAdmin={() => setView('admin')}
      />
    );
  }

  // Login page
  if (view === 'login') {
    return (
      <LoginPage
        onLogin={handleLogin}
        onBack={() => setView('landing')}
      />
    );
  }

  // Landing
  return (
    <LandingPage
      onLogin={() => setView('login')}
      onApply={() => {
        const el = document.getElementById('trade-access-form');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }}
    />
  );
}

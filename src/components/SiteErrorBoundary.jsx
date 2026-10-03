import { Component } from 'react';
import { captureError } from '../lib/monitoring';

export default class SiteErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error, info) {
    captureError(error, { source: 'site_recovery', componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#050505', color: '#fff' }}>
        <section role="alert" aria-labelledby="site-recovery-title" style={{ maxWidth: 520, lineHeight: 1.6 }}>
          <h1 id="site-recovery-title">We couldn’t load this page.</h1>
          <p>Please refresh to try again, or return to the home page. Your saved basket has not been cleared.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '12px 20px', background: '#d2aa4e', color: '#050505', border: '1px solid #d2aa4e', borderRadius: 8, fontWeight: 700 }}>Refresh page</button>
            <a href="/" style={{ color: '#d2aa4e', padding: '12px 0' }}>Return to home</a>
          </div>
        </section>
      </main>
    );
  }
}

import { Component } from 'react';
import { captureError } from '../lib/monitoring';

export default class PortalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'The portal hit a rendering error.',
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('PortalErrorBoundary caught portal render error:', error, errorInfo);
    captureError(error, { componentStack: errorInfo?.componentStack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleHardRefresh = () => {
    try { window.sessionStorage.removeItem('proto-lazy-retry'); } catch {}
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    if (this.state.hasError) {
      const staleDeploy = /mime type|javascript mime|dynamically imported|module script/i.test(this.state.errorMessage);
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', padding: '24px' }}>
          <div style={{ maxWidth: '560px', width: '100%', background: '#111827', color: '#f8fafc', border: '1px solid #1f2937', borderRadius: '18px', padding: '28px', fontFamily: 'Inter, sans-serif', boxShadow: '0 18px 50px rgba(0,0,0,0.45)' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#fb7185', marginBottom: '10px' }}>Portal error recovered</div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '10px', fontFamily: 'Outfit, sans-serif' }}>We hit a loading problem in the portal.</h1>
            <p style={{ color: '#cbd5e1', lineHeight: 1.6, marginBottom: '14px' }}>
              {staleDeploy
                ? 'The site was updated while your browser still had an old copy cached. Refresh once to load the latest portal — your products are still there.'
                : 'The app caught the error instead of showing a blank black screen. You can retry now, or refresh the page once.'}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px', wordBreak: 'break-word' }}>
              Error: {this.state.errorMessage}
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={this.handleHardRefresh} style={{ padding: '12px 18px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                Refresh page
              </button>
              <button onClick={this.handleRetry} style={{ padding: '12px 18px', background: '#1f2937', color: '#fff', border: '1px solid #334155', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>
                Retry portal
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

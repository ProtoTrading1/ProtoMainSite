import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import SiteErrorBoundary from './components/SiteErrorBoundary.jsx'
import { captureError, initMonitoring } from './lib/monitoring'

initMonitoring();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
document.documentElement.scrollTop = 0;
document.body.scrollTop = 0;

const CHUNK_RELOAD_KEY = 'proto-chunk-reload';
window.addEventListener('unhandledrejection', (event) => {
  const message = String(event?.reason?.message || event?.reason || '');
  const isChunkError = /mime type|dynamically imported|module script failed|failed to fetch dynamically imported module/i.test(message);
  if (!isChunkError) {
    captureError(event?.reason, { source: 'unhandledrejection' });
    return;
  }
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch { return; }
  event.preventDefault();
  window.location.reload();
});

window.addEventListener('error', (event) => {
  captureError(event?.error || event?.message, { source: 'window.onerror' });
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SiteErrorBoundary><Root /></SiteErrorBoundary>
  </StrictMode>,
)

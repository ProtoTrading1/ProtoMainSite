import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Named import: the SDK is CommonJS and its `default` export does not survive
// bundler interop (default-import threw "v.default is not a function" and
// blanked the app). The named `Intercom` export is the init function.
import { Intercom } from '@intercom/messenger-js-sdk'
import './index.css'
import Root from './Root.jsx'
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
  if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return;
  event.preventDefault();
  try { window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1'); } catch {}
  window.location.reload();
});

window.addEventListener('error', (event) => {
  captureError(event?.error || event?.message, { source: 'window.onerror' });
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

// Boot Intercom after render and isolate any failure so the chat widget can
// never block the app from mounting.
try {
  Intercom({ app_id: 'qk0xorsx', alignment: 'left' });
} catch (err) {
  console.error('Intercom init failed:', err);
}

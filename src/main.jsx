import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Named import: the SDK is CommonJS and its `default` export does not survive
// bundler interop (default-import threw "v.default is not a function" and
// blanked the app). The named `Intercom` export is the init function.
import { Intercom } from '@intercom/messenger-js-sdk'
import './index.css'
import Root from './Root.jsx'

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
document.documentElement.scrollTop = 0;
document.body.scrollTop = 0;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

// Boot Intercom after render and isolate any failure so the chat widget can
// never block the app from mounting.
try {
  Intercom({ app_id: 'qk0xorsx' });
} catch (err) {
  console.error('Intercom init failed:', err);
}

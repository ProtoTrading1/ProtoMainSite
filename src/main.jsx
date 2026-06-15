import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Intercom from '@intercom/messenger-js-sdk'
import './index.css'
import Root from './Root.jsx'

Intercom({
  app_id: 'qk0xorsx',
});

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
document.documentElement.scrollTop = 0;
document.body.scrollTop = 0;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

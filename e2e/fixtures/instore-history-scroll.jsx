// Real router with delayed synthetic Main layout; no services or account.
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { useHashNav } from '../../src/hooks/useHashNav.js';
if (location.hostname !== '127.0.0.1') throw Error('Local fixture only');
window.history.scrollRestoration = 'manual';
export default function Fixture() {
  const { path, navigate, restoreInstoreReturnScroll } = useHashNav();
  const [ready, setReady] = useState(false);
  const main = path.length === 0;
  useEffect(() => {
    setReady(false);
    if (!main) return undefined;
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, [main]);
  useEffect(() => {
    if (main && ready) return restoreInstoreReturnScroll();
    return undefined;
  }, [main, ready, restoreInstoreReturnScroll]);
  return <><nav style={{ position: 'fixed', top: 0, left: 0, zIndex: 10, background: 'white' }}><button onClick={() => navigate(['instore-products'])}>Instore</button><button onClick={() => navigate([], { q: 'notebook' })}>New Main</button><button onClick={() => navigate(['other'])}>Other</button></nav><main style={{ minHeight: main && ready ? 2600 : 200 }}><h1>{main ? ready ? 'Main ready' : 'Main loading' : path[0]}</h1><div className="content-area" style={{ height: 220, overflow: 'auto', marginTop: 80 }}><div style={{ height: main && ready ? 2200 : 100 }}>Synthetic content</div></div></main></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

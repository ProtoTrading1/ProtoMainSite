// Local-only harness: real data loader, router and Instore cards; no account login.
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import ExtendedRangePage from '../../src/components/ExtendedRangePage.jsx';
import { useHashNav } from '../../src/hooks/useHashNav.js';
import { rememberAuthSession } from '../../src/lib/authHeaders.js';
if (location.hostname !== '127.0.0.1') throw Error('Local fixture only');
rememberAuthSession({ access_token: 'synthetic-first-results-only', user: { id: '10000000-0000-4000-8000-000000000001' } });
export default function Fixture() {
  const { path, refinements, navigate } = useHashNav();
  if (path[0] === 'instore-products') return <ExtendedRangePage initialQuery={refinements.q || ''} addToCart={() => {}} />;
  return <main style={{ minHeight: 2500, paddingTop: 350 }}><h1>Main fixture</h1><p>{JSON.stringify(refinements)}</p><button onClick={() => navigate(['instore-products'], { q: '8640000272' })}>Open exact Instore</button><button onClick={() => navigate(['instore-products'])}>Open Instore browse</button></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

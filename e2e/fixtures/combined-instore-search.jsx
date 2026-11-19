// Local-only harness for the real cross-catalogue results and search hook.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/index.css';
import MainContent from '../../src/components/MainContent.jsx';
import useInstoreSearch from '../../src/hooks/useInstoreSearch.js';
import { rememberAuthSession } from '../../src/lib/authHeaders.js';
import { prefetchInstoreCatalogue, clearStoredInstoreResponses } from '../../src/lib/extendedRange.js';
import { searchProducts } from '../../tests/fixtures/instore-search-products.mjs';

if (location.hostname !== '127.0.0.1') throw Error('Local fixture only');
rememberAuthSession({ access_token: 'synthetic-combined-search-only', user: { id: '10000000-0000-4000-8000-000000000001' } });
const main = { ...searchProducts(1)[0], id: 'SYNTHETIC-MAIN', name: 'Main catalogue result' };
window.combinedSearchFixture = { refresh: prefetchInstoreCatalogue, clear: clearStoredInstoreResponses, products: searchProducts(5000) };
export default function Fixture() {
  const [query, setQuery] = useState('bracelets');
  const instoreSearch = useInstoreSearch(query);
  return <><label>Search all products <input aria-label="Search all products" value={query} onChange={e => setQuery(e.target.value)} /></label><MainContent
    products={[main]} resultsTotal={58} addToCart={() => {}} path={[]} navigate={() => {}}
    searchQuery={query} searchActive={Boolean(query)} instoreSearch={instoreSearch}
  /></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

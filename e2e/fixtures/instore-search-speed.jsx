// Local-only browser fixture; no production account or catalogue access.
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import ExtendedRangePage from '../../src/components/ExtendedRangePage.jsx';
import { rememberAuthSession } from '../../src/lib/authHeaders.js';
import { searchProducts } from '../../tests/fixtures/instore-search-products.mjs';

if (location.hostname !== '127.0.0.1') throw Error('Local fixture only');
rememberAuthSession({ access_token: 'synthetic-search-fixture-only', user: { id: '10000000-0000-4000-8000-000000000001' } });
await new Promise((resolve, reject) => {
  const request = indexedDB.open('proto-instore', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('collection');
  request.onerror = reject;
  request.onsuccess = () => {
    const db = request.result, transaction = db.transaction('collection', 'readwrite');
    transaction.objectStore('collection').put({ data: searchProducts(5000), ts: Date.now(), contentGeneration: null }, 'approved-customer-content-v1');
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = reject;
  };
});
createRoot(document.getElementById('root')).render(<ExtendedRangePage addToCart={() => {}} />);

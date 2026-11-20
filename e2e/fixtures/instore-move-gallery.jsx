import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import ProductCard from '../../src/components/ProductCard.jsx';
import { rememberAuthSession } from '../../src/lib/authHeaders.js';
import { attachInstoreMoveGalleries } from '../../lib/instore-move-galleries.mjs';
if (location.hostname !== '127.0.0.1') throw Error('Local fixture only');
rememberAuthSession({ access_token: 'synthetic-moved-gallery-only', user: { id: '10000000-0000-4000-8000-000000000001' } });
const urls = Array.from({ length: 200 }, (_, i) => `https://images.example.test/kept-${i}.jpg`);
const product = { id: 'SYNTHETIC-MOVE', sku: 'SYNTHETIC-MOVE', name: 'Existing public gallery', price: 12.5,
  image: urls[0], images: urls.slice(0, 4), stockQty: 20, stockOnHand: 20, minQty: 1, hasPreservedInstoreGallery: true };
const client = { rpc: () => ({ abortSignal: async () => ({ data: [{ sku: product.sku, currentImage: urls[0], imageUrls: urls }] }) }) };
const [moved] = await attachInstoreMoveGalleries([product], client);
createRoot(document.getElementById('root')).render(<ProductCard product={moved} addToCart={() => {}} />);

import {
  ArrowRight,
  CheckCircle2,
  Flame,
  LayoutGrid,
  List,
  Loader2,
  PackageCheck,
  PackageX,
  Search,
  Sparkles,
  Tag,
  TimerReset,
} from 'lucide-react';
import ProductCard from './ProductCard';
import Breadcrumb from './Breadcrumb';

const shortcuts = [
  { id: 'start', icon: PackageCheck, title: 'All Products', desc: 'Browse the full trade range' },
  { id: 'instock', icon: CheckCircle2, title: 'In Stock', desc: 'Available now' },
  { id: 'hot', icon: Flame, title: 'Hot Sellers', desc: 'Fast-moving lines' },
  { id: 'new', icon: Sparkles, title: 'New Stock', desc: 'Fresh arrivals' },
  { id: 'clearance', icon: Tag, title: 'Clearance Stock', desc: 'Special pricing lines' },
  { id: 'soldout', icon: PackageX, title: 'Missed Out', desc: 'Out of stock' },
];

export default function MainContent({
  products,
  allProductCount,
  categoryProductCount = products.length,
  addToCart,
  cartQtyMap = {},
  onCartQtyChange = () => {},
  path,
  navigate,
  breadcrumb,
  searchQuery = '',
  setSearchQuery = () => {},
  sort = 'featured',
  setSort = () => {},
  onShortcut = () => {},
  activeCollection = 'all',
  collectionLabel = 'All Products',
  recommendationProducts = [],
  loading = false,
  page = 1,
  totalPages = 1,
  onPageChange = () => {},
  usingFallback = false,
}) {
  const isCategoryPage = path && path.length > 0;
  const isAllProductsPage = !isCategoryPage && activeCollection === 'all';
  const currentLabel = isCategoryPage ? breadcrumb[breadcrumb.length - 1]?.label || 'All Wholesale Products' : isAllProductsPage ? 'All Wholesale Products' : collectionLabel;
  const resultLabel = searchQuery
    ? `${categoryProductCount} matching ${categoryProductCount === 1 ? 'item' : 'items'}`
    : `${categoryProductCount} trade ${categoryProductCount === 1 ? 'item' : 'items'}`;

  return (
    <div className="catalog-page">
      {isAllProductsPage && (
        <section className="trade-hero">
          <div className="trade-hero-copy">
            <span className="eyebrow">Established 1987 | Wholesale supply</span>
            <h1>Built for retailers who need stock that moves.</h1>
            <p>
              Browse core wholesale lines, build a quote-ready basket, and send a clean request
              to the Proto Trading sales team for stock, VAT, and delivery confirmation.
            </p>
            <div className="hero-proof">
              <span><CheckCircle2 size={15} /> Trade-only ordering</span>
              <span><CheckCircle2 size={15} /> Quote confirmed by reply</span>
              <span><CheckCircle2 size={15} /> Built for repeat buyers</span>
            </div>
            <div className="hero-metrics">
              <div><strong>5,000+</strong><span>catalogue lines</span></div>
              <div><strong>R1,000</strong><span>minimum order</span></div>
              <div><strong>SA-wide</strong><span>delivery support</span></div>
            </div>
          </div>
          <div className="trade-hero-image">
            <img src="/campaign-hero-v2.png?v=2" alt="Premium wholesale product campaign" />
          </div>
        </section>
      )}

      <div className="catalog-toolbar">
        <Breadcrumb crumbs={breadcrumb} navigate={navigate} />
        {isCategoryPage ? (
          <button className="text-action" onClick={() => navigate([])} type="button">
            Go back to all products
          </button>
        ) : activeCollection !== 'all' ? (
          <button className="text-action" onClick={() => onShortcut('start')} type="button">
            Go back to all products
          </button>
        ) : null}
      </div>

      <section className="section-heading">
        <div>
          <span className="eyebrow">Trade catalogue</span>
          <h2>{currentLabel}</h2>
          <p>
            {resultLabel} from {allProductCount} live catalogue products.
            {usingFallback ? ' Running on fallback catalogue data.' : ''}
          </p>
        </div>
        <div className="view-toggle">
          <LayoutGrid size={18} />
          <List size={18} />
        </div>
      </section>

      <div className="shortcut-grid">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          const isActive = (item.id === 'start' && activeCollection === 'all') || item.id === activeCollection;
          return (
            <button key={item.id} className={`shortcut-card ${isActive ? 'active' : ''}`} onClick={() => onShortcut(item.id)} type="button">
              <Icon size={22} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.desc}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          );
        })}
      </div>

      <div className="results-control">
        <label className="sort-control">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="featured">Most Popular</option>
            <option value="latest">Sort by Latest</option>
            <option value="price-low">Low to High</option>
            <option value="stock">Stock Status</option>
          </select>
        </label>
      </div>

      {isAllProductsPage ? (
        <section className="trade-story-card">
          <div>
            <span className="eyebrow">Built for retailers</span>
            <h3>Move from browsing to quote-ready faster.</h3>
            <p>Browse core wholesale lines, build a clean basket, and send one sharp order request to the Proto Trading team.</p>
          </div>
          <div className="hero-proof">
            <span><CheckCircle2 size={15} /> Trade-only ordering</span>
            <span><CheckCircle2 size={15} /> Quote confirmed by reply</span>
            <span><CheckCircle2 size={15} /> Built for repeat buyers</span>
          </div>
        </section>
      ) : recommendationProducts.length > 0 ? (
        <section className="recommendation-section">
          <div className="recommendation-heading">
            <span className="eyebrow">Recommended next</span>
            <h3>We think you will like these</h3>
          </div>
          <div className="recommendation-grid">
            {recommendationProducts.map((product) => (
              <ProductCard
                key={`rec-${product.id}`}
                product={product}
                addToCart={addToCart}
                cartQty={cartQtyMap[product.id] || 0}
                onCartQtyChange={onCartQtyChange}
              />
            ))}
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px', color: '#64748b' }}>
          <Loader2 size={24} />
          <span>Loading catalogue…</span>
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <Search size={32} />
          <h3>No matching products</h3>
          <p>Clear the search or choose another category to continue building the order.</p>
          <button onClick={() => { setSearchQuery(''); onShortcut('start'); }} type="button">
            Go back to all products
          </button>
        </div>
      ) : (
        <>
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                addToCart={addToCart}
                cartQty={cartQtyMap[product.id] || 0}
                onCartQtyChange={onCartQtyChange}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button onClick={() => onPageChange(Math.max(1, page - 1))} type="button" disabled={page <= 1} className="text-action" style={{ opacity: page <= 1 ? 0.45 : 1 }}>
                Previous page
              </button>
              <span style={{ color: '#64748b', alignSelf: 'center' }}>Page {page} of {totalPages}</span>
              <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} type="button" disabled={page >= totalPages} className="text-action" style={{ opacity: page >= totalPages ? 0.45 : 1 }}>
                Next page
              </button>
            </div>
          ) : null}
        </>
      )}

      <section className="buyer-note">
        <TimerReset size={18} />
        <div>
          <strong>Trade pricing is confirmed by reply.</strong>
          <span>Prices shown are excl. VAT and intended for wholesale quote building.</span>
        </div>
      </section>
    </div>
  );
}

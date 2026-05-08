import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Flame,
  LayoutGrid,
  List,
  Loader2,
  PackageCheck,
  Search,
  Sparkles,
  Star,
  TimerReset,
} from 'lucide-react';
import ProductCard from './ProductCard';
import Breadcrumb from './Breadcrumb';

const shortcuts = [
  { id: 'start',    icon: PackageCheck, title: 'All Products',        desc: 'Browse the full trade range' },
  { id: 'hot',      icon: Flame,        title: 'Hot Sellers',         desc: 'Fast-moving lines' },
  { id: 'new',      icon: Sparkles,     title: 'New Stock',           desc: 'Fresh arrivals' },
  { id: 'specials', icon: Star,         title: "This Week's Specials", desc: 'Starred deals for you' },
];

export default function MainContent({
  products,
  allProductCount,
  categoryProductCount = products.length,
  addToCart,
  path,
  navigate,
  breadcrumb,
  searchQuery = '',
  setSearchQuery = () => {},
  sort = 'featured',
  setSort = () => {},
  onShortcut = () => {},
  showSpecials = false,
  loading = false,
}) {
  const isFiltered = path && path.length > 0;
  const currentLabel = showSpecials
    ? "This Week's Specials"
    : isFiltered ? breadcrumb[breadcrumb.length - 1]?.label : 'All Wholesale Products';
  const resultLabel = searchQuery
    ? `${products.length} matching ${products.length === 1 ? 'item' : 'items'}`
    : `${categoryProductCount} trade ${categoryProductCount === 1 ? 'item' : 'items'}`;
  const visibleProducts = products.slice(0, 60);
  const hiddenCount = Math.max(0, products.length - visibleProducts.length);

  return (
    <div className="catalog-page">
      {!isFiltered && !showSpecials && (
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

      {showSpecials && (
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Star size={20} color="#e11d48" fill="#e11d48" />
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>
            This Week&apos;s Specials
          </h2>
        </div>
      )}

      <div className="catalog-toolbar">
        <Breadcrumb crumbs={breadcrumb} navigate={navigate} />
        {(isFiltered || showSpecials) && (
          <button className="text-action" onClick={() => { navigate([]); onShortcut('start'); }} type="button">
            Clear filter
          </button>
        )}
      </div>

      <section className="section-heading">
        <div>
          <span className="eyebrow">Trade catalogue</span>
          <h2>{currentLabel}</h2>
          <p>
            {resultLabel} from {allProductCount} live catalogue products.
            {hiddenCount > 0 ? ` Showing first ${visibleProducts.length}; use search or categories to narrow.` : ''}
          </p>
        </div>
        <div className="view-toggle">
          <LayoutGrid size={18} />
          <List size={18} />
        </div>
      </section>

      {!isFiltered && !showSpecials && (
        <div className="shortcut-grid">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className="shortcut-card" onClick={() => onShortcut(item.id)} type="button">
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
      )}

      <div className="results-control">
        <label className="within-search">
          <Search size={17} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search within visible products — typos OK"
          />
        </label>
        <label className="sort-control">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="featured">Featured</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="newest">Newest stock</option>
            <option value="code">SKU code</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px', color: '#94a3b8' }}>
          <Loader2 size={24} />
          <span>Loading catalogue…</span>
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <Search size={32} />
          <h3>{showSpecials ? 'No specials available for your tier.' : 'No matching products'}</h3>
          <p>
            {showSpecials
              ? 'Check back later or browse the full catalogue.'
              : 'Clear the search or choose another category to continue building the order.'}
          </p>
          <button onClick={() => { setSearchQuery(''); onShortcut('start'); }} type="button">
            Clear filter
          </button>
        </div>
      ) : (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} addToCart={addToCart} />
          ))}
        </div>
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

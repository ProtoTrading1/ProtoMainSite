import {
  ArrowLeft,
  CheckCircle2,
  Flame,
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

const CATEGORY_LABELS = {
  'arts-crafts-stationery': 'Arts & Crafts',
  'beads-jewellery': 'Beads & Jewellery',
  'beauty-personal-care': 'Beauty & Care',
  'confectionery': 'Confectionery',
  'events-hospitality': 'Events',
  'fashion-accessories': 'Fashion',
  'hardware': 'Hardware',
  'homeware-kitchen': 'Homeware',
  'packaging': 'Packaging',
  'toys-games-novelty': 'Toys & Games',
  'food-drinks': 'Food & Drinks',
  'textiles': 'Textiles',
  'uncategorized': 'General',
};

export function catLabel(slug) {
  return CATEGORY_LABELS[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const shortcuts = [
  { id: 'start', icon: PackageCheck, title: 'All Products' },
  { id: 'instock', icon: CheckCircle2, title: 'In Stock' },
  { id: 'hot', icon: Flame, title: 'Hot Sellers' },
  { id: 'new', icon: Sparkles, title: 'New Stock' },
  { id: 'clearance', icon: Tag, title: 'Clearance' },
  { id: 'soldout', icon: PackageX, title: 'Missed Out' },
];

export default function MainContent({
  products,
  allProductCount,
  categoryProductCount = products.length,
  addToCart,
  cartQtyMap = {},
  onCartQtyChange = () => {},
  specialsMap = {},
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
  browseCategories = [],
  categoryCounts = {},
}) {
  const isCategoryPage = path && path.length > 0;
  const isAllProductsPage = !isCategoryPage && activeCollection === 'all';
  const showCategoryGrid = isAllProductsPage && !searchQuery && browseCategories.length > 0;
  const currentLabel = isCategoryPage
    ? (path[0] || 'Products')
    : isAllProductsPage ? 'All Wholesale Products' : collectionLabel;

  return (
    <div className="catalog-page">
      {isAllProductsPage && !searchQuery && !isCategoryPage && (
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
          </div>
          <div className="trade-hero-image">
            <img src="/campaign-hero-v2.png?v=2" alt="Premium wholesale product campaign" />
          </div>
        </section>
      )}

      {/* Collection filter tabs */}
      <div className="shortcut-pills">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          const isActive = (item.id === 'start' && activeCollection === 'all' && !isCategoryPage) || item.id === activeCollection;
          return (
            <button
              key={item.id}
              className={`shortcut-pill${isActive ? ' active' : ''}`}
              onClick={() => { onShortcut(item.id); }}
              type="button"
            >
              <Icon size={14} />
              {item.title}
            </button>
          );
        })}
      </div>

      {/* Category browse pills */}
      {showCategoryGrid && (
        <section className="cat-browse">
          <div className="cat-browse-head">
            <span className="eyebrow">Shop by department</span>
            <h2 className="cat-browse-title">What are you looking for?</h2>
          </div>
          <div className="cat-pill-row">
            {browseCategories.filter((c) => c !== 'uncategorized').map((cat) => (
              <button
                key={cat}
                className="cat-pill"
                onClick={() => navigate([cat])}
                type="button"
              >
                <span className="cat-pill-name">{catLabel(cat)}</span>
                <span className="cat-pill-count">{categoryCounts[cat] ?? 0}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Back button when browsing a category */}
      {isCategoryPage && (
        <div className="cat-back-bar">
          <button className="cat-back-btn" onClick={() => navigate([])} type="button">
            <ArrowLeft size={15} /> All departments
          </button>
          <h2 className="cat-current-label">{currentLabel}</h2>
        </div>
      )}

      {/* Non-all-products collection heading */}
      {!isAllProductsPage && !isCategoryPage && (
        <div className="cat-back-bar">
          <button className="cat-back-btn" onClick={() => onShortcut('start')} type="button">
            <ArrowLeft size={15} /> All products
          </button>
          <h2 className="cat-current-label">{collectionLabel}</h2>
        </div>
      )}

      {/* Sort + count bar — only show when browsing products, not on the category landing */}
      {(!showCategoryGrid || searchQuery || isCategoryPage || activeCollection !== 'all') && (
        <div className="results-control">
          <span className="results-count">
            {searchQuery
              ? `${categoryProductCount} result${categoryProductCount !== 1 ? 's' : ''}`
              : `${categoryProductCount} product${categoryProductCount !== 1 ? 's' : ''}`}
          </span>
          <label className="sort-control">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="featured">Most Popular</option>
              <option value="latest">Sort by Latest</option>
              <option value="price-low">Low to High</option>
              <option value="stock">Stock Status</option>
            </select>
          </label>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px', color: '#64748b' }}>
          <Loader2 size={24} className="spin" />
          <span>Loading catalogue…</span>
        </div>
      ) : products.length === 0 && (isCategoryPage || activeCollection !== 'all' || searchQuery) ? (
        <div className="empty-state">
          <Search size={32} />
          <h3>No matching products</h3>
          <p>Clear the search or choose another category to continue building the order.</p>
          <button onClick={() => { setSearchQuery(''); onShortcut('start'); navigate([]); }} type="button">
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
                special={specialsMap[product.id] || null}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination-bar">
              <button onClick={() => onPageChange(Math.max(1, page - 1))} type="button" disabled={page <= 1} className="text-action" style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                ← Previous
              </button>
              <span className="pagination-info">Page {page} of {totalPages}</span>
              <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} type="button" disabled={page >= totalPages} className="text-action" style={{ opacity: page >= totalPages ? 0.4 : 1 }}>
                Next →
              </button>
            </div>
          )}
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

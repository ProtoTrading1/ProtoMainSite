import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Flame,
  Loader2,
  PackageCheck,
  Search,
  Sparkles,
  Tag,
  TimerReset,
} from 'lucide-react';
import ProductCard from './ProductCard';
import { buildImageCandidates } from '../lib/imageUrl';
import Breadcrumb from './Breadcrumb';
import CategoryLanding from './CategoryLanding';
import { slugToLabel } from '../lib/taxonomy';

// Labels are driven by the imported taxonomy (categories.json) so site, admin,
// and nav stay in sync with a single source of truth.
export function catLabel(slug) {
  return slugToLabel(slug);
}

function BannerHeroImage({ src, updatedAt, alt }) {
  const busted = updatedAt
    ? `${src}${src.includes('?') ? '&' : '?'}v=${encodeURIComponent(updatedAt)}`
    : src;
  const candidates = buildImageCandidates(busted);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [busted]);

  if (!candidates.length || !candidates[idx]) return null;

  return (
    <img
      key={busted}
      src={candidates[idx]}
      alt={alt}
      loading="eager"
      fetchpriority="high"
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

const shortcuts = [
  { id: 'start', icon: PackageCheck, title: 'All Products' },
  { id: 'hot', icon: Flame, title: 'Hot Sellers' },
  { id: 'new', icon: Sparkles, title: 'New Stock' },
  { id: 'clearance', icon: Tag, title: 'Clearance' },
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
  categoryNode = null,
  categories = [],
  onProductPreview = null,
  bannerConfig = null,
  searchActive = false,
  onSearchProductClick = null,
}) {
  const bannerTitle = bannerConfig?.title || 'Built for retailers who need stock that moves.';
  const bannerBody = bannerConfig?.body || 'Browse core wholesale lines, build a quote-ready basket, and send a clean request to the Proto Trading sales team for stock, VAT, and delivery confirmation.';
  const bannerImage = bannerConfig?.imageUrl || '/campaign-hero-v2.png?v=2';
  const bannerUpdatedAt = bannerConfig?.updatedAt || null;
  const isCategoryPage = path && path.length > 0;
  const isAllProductsPage = !isCategoryPage && activeCollection === 'all';
  const showCategoryGrid = false; // removed: department pills now live in the sidebar
  const currentLabel = isCategoryPage
    ? catLabel(path[path.length - 1])
    : isAllProductsPage ? 'All Wholesale Products' : collectionLabel;
  const backPath = path && path.length > 1 ? path.slice(0, -1) : [];
  const backLabel = backPath.length ? catLabel(backPath[backPath.length - 1]) : 'All departments';

  // Show the discovery landing when on a dept/category that has subcategories and no active search
  const showLanding = isCategoryPage && !searchQuery && categoryNode?.children?.length > 0 && activeCollection === 'all';

  return (
    <div className={`catalog-page${showLanding ? ' catalog-page--category-hub' : ''}`}>
      {isAllProductsPage && !searchQuery && !isCategoryPage && (
        <section className="trade-hero">
          <div className="trade-hero-copy">
            <span className="eyebrow">Established 1987 | Wholesale supply</span>
            <h1>{bannerTitle}</h1>
            <p>{bannerBody}</p>
            <div className="hero-proof">
              <span><CheckCircle2 size={15} /> Trade-only ordering</span>
              <span><CheckCircle2 size={15} /> Quote confirmed by reply</span>
              <span><CheckCircle2 size={15} /> Built for repeat buyers</span>
            </div>
          </div>
          <div className="trade-hero-image trade-hero-image--banner">
            <BannerHeroImage src={bannerImage} updatedAt={bannerUpdatedAt} alt="Premium wholesale product campaign" />
          </div>
        </section>
      )}


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

      {/* Category discovery landing OR back bar */}
      {isCategoryPage && showLanding && (
        <CategoryLanding
          categoryNode={categoryNode}
          path={path}
          products={products}
          counts={categoryCounts}
          categories={categories}
          navigate={navigate}
          addToCart={addToCart}
          cartQtyMap={cartQtyMap}
          onCartQtyChange={onCartQtyChange}
          onProductPreview={onProductPreview}
          depth={path.length}
        />
      )}
      {isCategoryPage && !showLanding && (
        <div className="cat-back-bar">
          <button className="cat-back-btn" onClick={() => navigate(backPath)} type="button">
            <ArrowLeft size={15} /> {backLabel}
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

      {searchQuery && (
        <div className="active-search-bar">
          <span className="active-search-label">Searching for</span>
          <span className="active-search-chip">
            <Search size={14} />
            {searchQuery}
          </span>
          <button
            type="button"
            className="active-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Sort + count bar — only show when browsing products, not on the category landing */}
      {(!showCategoryGrid || searchQuery || isCategoryPage || activeCollection !== 'all') && (
        <div className="results-control">
          <span className="results-count">
            {searchQuery
              ? `${categoryProductCount} result${categoryProductCount !== 1 ? 's' : ''} across all categories`
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
            {products.map((product, idx) => (
              <ProductCard
                key={product.id}
                product={product}
                addToCart={addToCart}
                cartQty={cartQtyMap[product.id] || 0}
                onCartQtyChange={onCartQtyChange}
                special={specialsMap[product.id] || null}
                priority={idx < 8}
                onSearchEngage={searchActive && onSearchProductClick ? () => onSearchProductClick(product, idx) : null}
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

    </div>
  );
}

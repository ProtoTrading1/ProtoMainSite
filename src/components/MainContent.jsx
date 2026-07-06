import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Flame,
  PackageCheck,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import ProductCard from './ProductCard';
import { ProductGridSkeleton } from './ProductCardSkeleton';
import CategoryLanding from './CategoryLanding';
import { slugToLabel } from '../lib/taxonomy';

// Labels are driven by the imported taxonomy (categories.json) so site, admin,
// and nav stay in sync with a single source of truth.
export function catLabel(slug) {
  return slugToLabel(slug);
}

function cartQtyForProduct(product, cartQtyMap) {
  if (product?.isVariantGroup && Array.isArray(product.variants) && product.variants.length) {
    return product.variants.reduce((sum, variant) => sum + (cartQtyMap[variant.id] || 0), 0);
  }
  return cartQtyMap[product.id] || 0;
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
  sort = 'best-selling',
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
  showWelcome = false,
  inStockOnly = false,
  onInStockOnlyChange = () => {},
  onResetFilters = () => {},
  refinements = {},
}) {
  const [showDelayedSkeleton, setShowDelayedSkeleton] = useState(false);
  const [isGridMuted, setIsGridMuted] = useState(false);
  const [isGridFadeIn, setIsGridFadeIn] = useState(false);
  const pendingReorderRef = useRef(false);
  const previousBrowseStateRef = useRef(null);
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
  const showWelcomeHome = showWelcome && isAllProductsPage && !searchQuery && !isCategoryPage;
  const pathKey = path.join('/');
  const searchKey = searchQuery.trim().toLowerCase();
  const refinementsKey = useMemo(
    () => Object.entries(refinements || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|'),
    [refinements],
  );

  // Group products by their next subcategory level when landing is shown and sort is featured.
  const productGroups = useMemo(() => {
    if (!showLanding || sort !== 'featured' || !products.length) return null;
    const groupKeys = [];
    const groupMap = new Map();
    for (const p of products) {
      const cp = p.categoryPath || [];
      const key = cp[path.length] || '__other__';
      if (!groupMap.has(key)) { groupKeys.push(key); groupMap.set(key, []); }
      groupMap.get(key).push(p);
    }
    if (groupKeys.length < 2) return null;
    return groupKeys.map((key) => ({ key, label: key === '__other__' ? 'Other' : slugToLabel(key), products: groupMap.get(key) }));
  }, [products, showLanding, sort, path]);

  useEffect(() => {
    if (!loading) {
      setShowDelayedSkeleton(false);
      return;
    }
    const timer = window.setTimeout(() => setShowDelayedSkeleton(true), 200);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const nextState = { pathKey, activeCollection, sort, inStockOnly, searchKey, refinementsKey };
    const prevState = previousBrowseStateRef.current;
    previousBrowseStateRef.current = nextState;
    if (!prevState) return;

    const pathChanged = prevState.pathKey !== nextState.pathKey;
    const sortOrFilterChanged = (
      prevState.activeCollection !== nextState.activeCollection
      || prevState.sort !== nextState.sort
      || prevState.inStockOnly !== nextState.inStockOnly
      || prevState.searchKey !== nextState.searchKey
      || prevState.refinementsKey !== nextState.refinementsKey
    );

    if (!pathChanged && sortOrFilterChanged) {
      pendingReorderRef.current = true;
      setIsGridMuted(true);
    }
  }, [pathKey, activeCollection, sort, inStockOnly, searchKey, refinementsKey]);

  useEffect(() => {
    if (!pendingReorderRef.current || loading) return;
    pendingReorderRef.current = false;
    setIsGridMuted(false);
    setIsGridFadeIn(true);
    const timer = window.setTimeout(() => setIsGridFadeIn(false), 140);
    return () => window.clearTimeout(timer);
  }, [loading, products]);

  const shouldShowSkeleton = loading && showDelayedSkeleton;

  return (
    <div className="catalog-page">
      {showWelcomeHome && (
        <div className="site-hero-banner">
          <img
            src="/main-site-banner.jpg"
            alt="Thank you for registering — Welcome to Proto Trading Online"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </div>
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

      {/* Sort + count bar — always available while browsing */}
      {(!showCategoryGrid || searchQuery || isCategoryPage || activeCollection !== 'all') && (
        <div className="results-control">
          <span className="results-count">
            {categoryProductCount} Product{categoryProductCount !== 1 ? 's' : ''}
          </span>
          <div className="results-control-actions">
            <label className="catalog-filter-control">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => onInStockOnlyChange(e.target.checked)}
              />
              <span>Available Only</span>
            </label>
            <label className="sort-control">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="featured">Featured</option>
                <option value="best-selling">Best Selling</option>
                <option value="newest">Newest</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name-asc">A–Z</option>
                <option value="name-desc">Z–A</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {shouldShowSkeleton ? (
        <ProductGridSkeleton count={products.length || 12} />
      ) : products.length === 0 ? (
        <div className="empty-state">
          <Search size={32} />
          <h3>No products match your current filters.</h3>
          <button onClick={onResetFilters} type="button">
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          <div className={`product-grid${isGridMuted ? ' product-grid--muted' : ''}${isGridFadeIn ? ' product-grid--fade-in' : ''}`}>
            {productGroups
              ? productGroups.flatMap((group) => [
                  <div key={`hdr-${group.key}`} className="product-grid-section-header">{group.label}</div>,
                  ...group.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      addToCart={addToCart}
                      cartQty={cartQtyForProduct(product, cartQtyMap)}
                      onCartQtyChange={onCartQtyChange}
                      special={specialsMap[product.id] || null}
                      priority={false}
                      onSearchEngage={null}
                    />
                  )),
                ])
              : products.map((product, idx) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    addToCart={addToCart}
                    cartQty={cartQtyForProduct(product, cartQtyMap)}
                    onCartQtyChange={onCartQtyChange}
                    special={specialsMap[product.id] || null}
                    priority={idx < 16}
                    onSearchEngage={searchActive && onSearchProductClick ? () => onSearchProductClick(product, idx) : null}
                  />
                ))
            }
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

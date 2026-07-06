import { useMemo } from 'react';
import {
  ArrowLeft,
  Flame,
  Loader2,
  PackageCheck,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import ProductCard from './ProductCard';
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
  showWelcome = false,
  inStockOnly = false,
  onInStockOnlyChange = () => {},
}) {
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
  const isHomeFeatured = isAllProductsPage && !searchQuery && sort === 'featured';

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

  return (
    <div className="catalog-page">
      {showWelcome && isAllProductsPage && !searchQuery && !isCategoryPage && (
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

      {/* Sort + count bar — only show when browsing products, not on the category landing */}
      {(!showCategoryGrid || searchQuery || isCategoryPage || activeCollection !== 'all') && (
        <div className="results-control">
          <span className="results-count">
            {searchQuery
              ? `${categoryProductCount} result${categoryProductCount !== 1 ? 's' : ''} across all categories`
              : isHomeFeatured
                ? `${categoryProductCount} featured product${categoryProductCount !== 1 ? 's' : ''}`
                : `${categoryProductCount} product${categoryProductCount !== 1 ? 's' : ''}`}
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

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px', color: '#64748b' }}>
          <Loader2 size={24} className="spin" />
          <span>Loading catalogue…</span>
        </div>
      ) : products.length === 0 && isHomeFeatured ? (
        <div className="empty-state">
          <Sparkles size={32} />
          <h3>No featured products yet</h3>
          <p>Try a different sort, or browse by category.</p>
          <button onClick={() => setSort('best-selling')} type="button">
            Show best selling
          </button>
        </div>
      ) : products.length === 0 && (isCategoryPage || activeCollection !== 'all' || searchQuery) ? (
        <div className="empty-state">
          <Search size={32} />
          <h3>{searchQuery ? 'No relevant products found.' : 'No matching products'}</h3>
          <p>Clear the search or choose another category to continue building the order.</p>
          <button onClick={() => { setSearchQuery(''); onShortcut('start'); navigate([]); }} type="button">
            Go back to all products
          </button>
        </div>
      ) : (
        <>
          <div className="product-grid">
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
                    priority={idx < 24}
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

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
import CategoryLanding from './CategoryLanding';

const CATEGORY_LABELS = {
  // Departments
  'arts-crafts-stationery': 'Arts & Crafts',
  'beads-jewellery': 'Beads & Jewellery',
  'beauty-personal-care': 'Beauty & Personal Care',
  'events-parties': 'Events & Parties',
  'fashion-accessories': 'Fashion & Accessories',
  'food-drinks': 'Food & Drinks',
  'hardware': 'Hardware',
  'homeware-kitchen': 'Homeware & Kitchen',
  'packaging': 'Packaging',
  'textiles': 'Textiles',
  'toys-games-kids': 'Toys, Games & Kids',
  // Sub1
  'notebooks-paper': 'Notebooks & Paper',
  'paint-brushes': 'Paint & Brushes',
  'pens-markers-pencils': 'Pens, Markers & Pencils',
  'school-essentials': 'School Essentials',
  'acrylic-plastic-beads': 'Acrylic & Plastic Beads',
  'elastic-cord-wire': 'Elastic, Cord & Wire',
  'glass-beads': 'Glass Beads',
  'jewellery-tools': 'Jewellery Tools',
  'pendants-charms': 'Pendants & Charms',
  'seed-beads': 'Seed Beads',
  'wooden-beads': 'Wooden Beads',
  'beauty-tools': 'Beauty Tools',
  'cosmetics': 'Cosmetics',
  'hair-care': 'Hair Care',
  'skin-body-care': 'Skin & Body Care',
  'travel-toiletry': 'Travel & Toiletry',
  'costume-novelty': 'Costume & Novelty',
  'party-decor': 'Party Decor',
  'scarves-wraps': 'Scarves & Wraps',
  'sunglasses-accessories': 'Sunglasses & Accessories',
  'wallets-purses': 'Wallets & Purses',
  'drinks-coffee': 'Drinks & Coffee',
  'pantry-spices': 'Pantry & Spices',
  'snacks': 'Snacks',
  'electrical-accessories': 'Electrical Accessories',
  'tools': 'Tools',
  'decor-household': 'Decor & Household',
  'kitchen-tools': 'Kitchen Tools',
  'display-packaging': 'Display Packaging',
  'gift-boxes': 'Gift Boxes',
  'fabric-felt': 'Fabric & Felt',
  'sewing-accessories': 'Sewing Accessories',
  'pocket-money-toys': 'Pocket Money Toys',
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
  categoryNode = null,
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

      {/* Category discovery landing OR back bar */}
      {isCategoryPage && showLanding && (
        <CategoryLanding
          categoryNode={categoryNode}
          products={products}
          counts={categoryCounts}
          navigate={navigate}
          addToCart={addToCart}
          cartQtyMap={cartQtyMap}
          onCartQtyChange={onCartQtyChange}
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

import { useMemo } from 'react';
import { ChevronRight, Flame, ImageOff, ShoppingCart, Sparkles } from 'lucide-react';
import { DEPT_COLORS, DEPT_DESCRIPTIONS, LUCIDE_ICON_MAP, USE_CASES } from '../lib/navConfig';

function StripCard({ product, addToCart, cartQty, onCartQtyChange }) {
  const inCart = cartQty > 0;

  return (
    <div className="strip-card">
      <div className="strip-card-img">
        {product.image ? (
          <img src={product.image} alt={product.name} loading="lazy" />
        ) : (
          <div className="strip-card-no-img">
            <ImageOff size={20} />
          </div>
        )}
      </div>
      <div className="strip-card-body">
        <span className="strip-card-code">{product.code}</span>
        <p className="strip-card-name">{product.name}</p>
        <div className="strip-card-footer">
          <strong className="strip-card-price">R{product.price.toFixed(2)}</strong>
          {inCart ? (
            <div className="strip-card-qty">
              <button onClick={() => onCartQtyChange(product, cartQty - 1)} type="button">−</button>
              <span>{cartQty}</span>
              <button onClick={() => onCartQtyChange(product, cartQty + 1)} type="button">+</button>
            </div>
          ) : (
            <button
              className="strip-card-add"
              onClick={() => addToCart(product, product.minQty || 1)}
              type="button"
            >
              <ShoppingCart size={11} /> Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CategoryLanding({
  categoryNode,
  products,
  counts,
  navigate,
  addToCart,
  cartQtyMap,
  onCartQtyChange,
}) {
  const color = DEPT_COLORS[categoryNode.id] || '#DC2626';
  const iconName = categoryNode.icon || 'Package';
  const Icon = LUCIDE_ICON_MAP[iconName] || LUCIDE_ICON_MAP.Package;
  const description = DEPT_DESCRIPTIONS[categoryNode.id] || '';
  const useCases = USE_CASES[categoryNode.id] || [];
  const subcategories = categoryNode.children || [];
  const totalCount = counts?.[categoryNode.id] || products.length;

  const hotSellers = useMemo(
    () => [...products].sort((a, b) => (b.yearlySales || 0) - (a.yearlySales || 0)).slice(0, 14),
    [products]
  );

  const newArrivals = useMemo(
    () =>
      [...products]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 14),
    [products]
  );

  return (
    <div className="cat-landing">
      {/* Department Hero */}
      <div className="cat-landing-hero" style={{ '--dept-color': color, borderLeftColor: color }}>
        <div className="cat-landing-hero-icon" style={{ background: `${color}1a`, color }}>
          <Icon size={22} />
        </div>
        <div className="cat-landing-hero-copy">
          <h2 className="cat-landing-title">{categoryNode.label}</h2>
          <div className="cat-landing-meta">
            <span className="cat-landing-count">{totalCount} products</span>
            {subcategories.length > 0 && (
              <span className="cat-landing-cats">· {subcategories.length} categories</span>
            )}
          </div>
        </div>
      </div>

      {/* Use Case Shortcuts */}
      {useCases.length > 0 && (
        <div className="cat-landing-usecases">
          <span className="cat-usecase-label">Shop by type</span>
          <div className="cat-usecase-pills">
            {useCases.map((uc) => (
              <button
                key={uc.label}
                className="cat-usecase-pill"
                onClick={() => navigate(uc.path)}
                type="button"
                style={{ '--uc-color': color }}
              >
                {uc.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subcategory Grid */}
      {subcategories.length > 0 && (
        <div className="cat-landing-section">
          <h3 className="cat-section-title">Browse all categories</h3>
          <div className="cat-subcat-grid">
            {subcategories.map((sub) => (
              <button
                key={sub.id}
                className="cat-subcat-card"
                onClick={() => navigate([categoryNode.id, sub.id])}
                type="button"
                style={{ '--dept-color': color }}
              >
                <div className="cat-subcat-card-body">
                  <span className="cat-subcat-name">{sub.label}</span>
                  {sub.children?.length > 0 && (
                    <span className="cat-subcat-types">{sub.children.length} types</span>
                  )}
                </div>
                <ChevronRight size={14} className="cat-subcat-arrow" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hot Sellers Strip */}
      {hotSellers.length > 0 && (
        <div className="cat-landing-section">
          <div className="cat-section-header">
            <Flame size={14} style={{ color }} />
            <h3 className="cat-section-title">Hot Sellers</h3>
            <span className="cat-section-sub">Most popular in {categoryNode.label}</span>
          </div>
          <div className="cat-product-strip">
            {hotSellers.map((product) => (
              <StripCard
                key={product.id}
                product={product}
                addToCart={addToCart}
                cartQty={cartQtyMap?.[product.id] || 0}
                onCartQtyChange={onCartQtyChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* New Arrivals Strip */}
      {newArrivals.length > 0 && (
        <div className="cat-landing-section">
          <div className="cat-section-header">
            <Sparkles size={14} style={{ color }} />
            <h3 className="cat-section-title">New Arrivals</h3>
            <span className="cat-section-sub">Recently added to {categoryNode.label}</span>
          </div>
          <div className="cat-product-strip">
            {newArrivals.map((product) => (
              <StripCard
                key={product.id}
                product={product}
                addToCart={addToCart}
                cartQty={cartQtyMap?.[product.id] || 0}
                onCartQtyChange={onCartQtyChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Separator before the full product grid */}
      <div className="cat-landing-divider">
        <span>All products in {categoryNode.label}</span>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { ChevronRight, Flame, ImageOff, ShoppingCart, Sparkles } from 'lucide-react';
import { DEPT_COLORS, LUCIDE_ICON_MAP, USE_CASES } from '../lib/navConfig';
import { buildImageCandidates } from '../lib/imageUrl';
import { lookupProductCount, filterNavChildrenByCount } from '../lib/taxonomy';

// ─── Product strip card ───────────────────────────────────────
function StripCard({ product, addToCart, cartQty, onCartQtyChange, onProductPreview }) {
  const inCart = cartQty > 0;
  return (
    <div className="strip-card">
      <button
        type="button"
        className="strip-card-img strip-card-img-btn"
        onClick={() => onProductPreview?.(product)}
        aria-label={`View ${product.name}`}
      >
        {product.image
          ? <img
              src={buildImageCandidates(product.image)[0]}
              alt={product.name}
              loading="lazy"
              decoding="async"
            />
          : <div className="strip-card-no-img"><ImageOff size={20} /></div>}
      </button>
      <div className="strip-card-body">
        <span className="strip-card-code">{product.code}</span>
        <button
          type="button"
          className="strip-card-name-btn"
          onClick={() => onProductPreview?.(product)}
        >
          <p className="strip-card-name">{product.name}</p>
        </button>
        <div className="strip-card-footer">
          {product.price > 0 && <strong className="strip-card-price">R{product.price.toFixed(2)}</strong>}
          {inCart ? (
            <div className="strip-card-qty">
              <button onClick={() => onCartQtyChange(product, cartQty - 1)} type="button">−</button>
              <span>{cartQty}</span>
              <button onClick={() => onCartQtyChange(product, cartQty + 1)} type="button">+</button>
            </div>
          ) : (
            <button className="strip-card-add" onClick={() => addToCart(product, product.minQty || 1)} type="button">
              <ShoppingCart size={11} /> Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Product strip section ────────────────────────────────────
function ProductStrip({ products, icon: Icon, title, subtitle, color, addToCart, cartQtyMap, onCartQtyChange, onProductPreview }) {
  if (!products.length) return null;
  return (
    <div className="cat-landing-section">
      <div className="cat-section-header">
        {Icon && <Icon size={14} style={{ color }} />}
        <h3 className="cat-section-title">{title}</h3>
        <span className="cat-section-sub">{subtitle}</span>
      </div>
      <div className="cat-product-strip">
        {products.map((p) => (
          <StripCard
            key={p.id}
            product={p}
            addToCart={addToCart}
            cartQty={cartQtyMap?.[p.id] || 0}
            onCartQtyChange={onCartQtyChange}
            onProductPreview={onProductPreview}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────
export default function CategoryLanding({
  categoryNode,
  path = [],
  products,
  counts,
  categories = [],
  navigate,
  addToCart,
  cartQtyMap,
  onCartQtyChange,
  onProductPreview,
  depth = 1,   // 1 = L1 dept, 2 = L2 category, 3+ = deep
}) {
  const isL1 = depth === 1;

  const color      = DEPT_COLORS[categoryNode.id] || '#7F1D1D';
  const iconName   = categoryNode.icon || 'Package';
  const Icon       = LUCIDE_ICON_MAP[iconName] || null;
  const useCases   = USE_CASES[categoryNode.id] || [];
  const subcats = filterNavChildrenByCount(categoryNode.children, path, counts, categories);
  const totalCount = lookupProductCount(counts, path, categories) ?? products.length;

  const hotSellers = useMemo(() => products.slice(0, 14), [products]);
  const newArrivals = useMemo(
    () => [...products].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 14),
    [products],
  );

  return (
    <div className={`cat-landing cat-landing--l${Math.min(depth, 3)}`}>

      {/* ── Hero ──────────────────────────────────────────── */}
      <div className="cat-landing-hero" style={{ borderLeftColor: color }}>
        {Icon && (
          <div className="cat-landing-hero-icon" style={{ background: `${color}1a`, color }}>
            <Icon size={isL1 ? 22 : 18} />
          </div>
        )}
        <div className="cat-landing-hero-copy">
          <h2 className="cat-landing-title" style={{ fontSize: isL1 ? undefined : '18px' }}>
            {categoryNode.label}
          </h2>
          <div className="cat-landing-meta">
            <span className="cat-landing-count">{totalCount} products</span>
            {subcats.length > 0 && (
              <span className="cat-landing-cats">· {subcats.length} categories</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Use-case shortcuts (L1 only) ──────────────────── */}
      {isL1 && useCases.length > 0 && (
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

      {/* ── Subcategory grid ──────────────────────────────── */}
      {subcats.length > 0 && (
        <div className="cat-landing-section">
          <h3 className="cat-section-title">
            {isL1 ? 'Browse all categories' : 'Subcategories'}
          </h3>
          <div className={`cat-subcat-grid${isL1 ? ' cat-subcat-grid--l1' : ' cat-subcat-grid--l2'}`}>
            {subcats.map((sub) => (
              <button
                key={sub.id}
                className="cat-subcat-card"
                onClick={() => navigate([...path, sub.id])}
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

      {/* ── Hot Sellers strip ─────────────────────────────── */}
      <ProductStrip
        products={hotSellers}
        icon={Flame}
        title="Featured"
        subtitle={`Top picks in ${categoryNode.label}`}
        color={color}
        addToCart={addToCart}
        cartQtyMap={cartQtyMap}
        onCartQtyChange={onCartQtyChange}
        onProductPreview={onProductPreview}
      />

      {/* ── New Arrivals strip (L1 only — keeps L2 lean) ─── */}
      {isL1 && (
        <ProductStrip
          products={newArrivals}
          icon={Sparkles}
          title="New Arrivals"
          subtitle={`Recently added to ${categoryNode.label}`}
          color={color}
          addToCart={addToCart}
          cartQtyMap={cartQtyMap}
          onCartQtyChange={onCartQtyChange}
          onProductPreview={onProductPreview}
        />
      )}

      {/* ── Divider before full product grid ──────────────── */}
      <div className="cat-landing-divider">
        <span>All products in {categoryNode.label}</span>
      </div>

    </div>
  );
}

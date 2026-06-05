import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Minus, Package, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react';
import { checkStock } from '../lib/products';
import { optimizedImageUrl } from '../lib/imageUrl';

// Fast CSS-only approach: mix-blend-mode:multiply makes white product backgrounds
// invisible against white card backgrounds — same visual result as the old canvas
// trimming but with zero JS processing and zero extra network requests.
function ProductImage({ src, alt, width = 400, priority = false }) {
  const [broken, setBroken] = useState(false);
  const optimized = optimizedImageUrl(src, { width, quality: 78 });

  if (!src || broken) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', color: '#d1d5db' }}>
        <ImageOff size={28} />
      </div>
    );
  }

  return (
    <img
      src={optimized}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchpriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setBroken(true)}
      style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }}
    />
  );
}

function SpecialRibbon({ special }) {
  if (!special) return null;
  let text = "This Week's Special";
  if (special.deal === 'discount' && special.discountPct) text = `${special.discountPct}% OFF`;
  if (special.deal === 'bogo') text = `Buy ${special.bogoX || 1} Get ${special.bogoY || 1} Free`;
  return (
    <div className="pc-special-corner" aria-label={text}>
      <span className="pc-special-ribbon">{text}</span>
    </div>
  );
}

function ProductQtyInput({ qty, setQty, minQty }) {
  const [draft, setDraft] = useState(String(qty));
  useEffect(() => { setDraft(String(qty)); }, [qty]);
  const commit = () => {
    const next = Math.max(minQty || 1, Math.min(9999, Number(draft) || minQty || 1));
    setDraft(String(next));
    setQty(next);
  };
  return (
    <input
      aria-label="Quantity"
      inputMode="numeric"
      min={minQty || 1}
      max="9999"
      type="number"
      value={draft}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

export default function ProductCard({ product, addToCart, cartQty = 0, onCartQtyChange, special, priority = false, initialZoomOpen = false, onZoomClose }) {
  const VAT = 0.15;
  const safePrice = Number(product?.price) || 0;
  const isVariantGroup = product?.isVariantGroup === true;
  const variants = product?.variants || [];
  const baseTags = Array.isArray(product?.tags) ? product.tags : [];
  const safeTags = isVariantGroup
    ? [{ label: 'Multiple Variants', bg: '#7F1D1D', color: '#fff' }, ...baseTags]
    : baseTags;
  const safeBadges = Array.isArray(product?.badges) ? product.badges : [];
  const [qty, setQty] = useState(product.minQty || 1);
  const [zoomOpen, setZoomOpen] = useState(initialZoomOpen);
  const [showStock, setShowStock] = useState(false);
  const [liveStock, setLiveStock] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const addButtonRef = useRef(null);

  const activeProduct = selectedVariant || product;
  const activePrice = Number(activeProduct?.price) || 0;
  const galleryImages = Array.isArray(activeProduct.images) && activeProduct.images.length > 1
    ? activeProduct.images
    : null;
  const lineTotal = (activePrice * qty).toFixed(2);
  const inCart = cartQty > 0;

  const openPreview = () => setZoomOpen(true);
  const closePreview = () => { setZoomOpen(false); setShowStock(false); setLiveStock(null); onZoomClose?.(); };

  const handleStockCheck = async () => {
    if (showStock) { setShowStock(false); setLiveStock(null); return; }
    setShowStock(true);
    setStockLoading(true);
    try {
      const qty = await checkStock(product.barcode || product.code);
      setLiveStock(qty);
    } catch {
      setLiveStock(product.stockOnHand ?? 0);
    } finally {
      setStockLoading(false);
    }
  };

  const handleAdd = () => {
    const rect = addButtonRef.current?.getBoundingClientRect();
    const pos = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    addToCart(product, qty, pos);
  };

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closePreview(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [zoomOpen]);

  return (
    <>
      <article className="product-card">
        {/* Image */}
        <button
          className="product-image product-image-button"
          onClick={openPreview}
          type="button"
          aria-label={`View ${product.name}`}
        >
          {safeTags.length > 0 && (
            <div className="tag-row">
              {safeTags.map((tag) => {
                const label = tag.label || tag;
                return (
                  <span key={label} style={tag.bg ? { backgroundColor: tag.bg, color: tag.color } : undefined}>
                    {label}
                  </span>
                );
              })}
            </div>
          )}
          <ProductImage src={product.localImage || product.image} alt={product.name} priority={priority} />
          <SpecialRibbon special={special} />
          <span className="zoom-cue"><ZoomIn size={13} /> View</span>
        </button>

        {/* Body */}
        <div className="product-body">
          <div className="product-meta">
            <span>{product.code}</span>
            <strong className={product.inStock ? 'pc-instock' : 'pc-confirm'}>
              {product.inStock ? 'In stock' : 'Confirm stock'}
            </strong>
          </div>

          <button className="product-title-button" onClick={openPreview} type="button">
            <h3>{product.name}</h3>
          </button>

          {safeBadges.length > 0 && (
            <div className="product-badges">
              {safeBadges.map((b) => <span key={b}>{b}</span>)}
            </div>
          )}

          <div className="price-row">
            <strong>R{safePrice.toFixed(2)}</strong>
            <span>incl. VAT · min {product.minQty || 1}</span>
          </div>

          <div className="buy-row">
            {inCart ? (
              <div className="cart-in-control">
                <button onClick={() => onCartQtyChange(product, cartQty - 1)} type="button" aria-label="Remove one">
                  <Minus size={15} />
                </button>
                <span>{cartQty}</span>
                <button onClick={() => onCartQtyChange(product, cartQty + 1)} type="button" aria-label="Add one more">
                  <Plus size={15} />
                </button>
              </div>
            ) : (
              <>
                <div className="qty-stepper" aria-label="Quantity">
                  <button onClick={() => setQty(Math.max(product.minQty || 1, qty - 1))} type="button" aria-label="Decrease">
                    <Minus size={14} />
                  </button>
                  <ProductQtyInput qty={qty} setQty={setQty} minQty={product.minQty || 1} />
                  <button onClick={() => setQty(qty + 1)} type="button" aria-label="Increase">
                    <Plus size={14} />
                  </button>
                </div>
                <button ref={addButtonRef} className="add-button" onClick={handleAdd} type="button">
                  <ShoppingCart size={15} />
                  Add
                </button>
              </>
            )}
          </div>
        </div>
      </article>

      {/* Zoom modal — rendered at document.body to escape any CSS transform stacking context */}
      {zoomOpen && createPortal(
        <div className="pz-backdrop" onClick={closePreview}>
          <div className="pz-modal" onClick={(e) => e.stopPropagation()}>

            {/* Dark image panel */}
            <div className="pz-image-panel">
              <button className="pz-close" onClick={closePreview} type="button" aria-label="Close">
                <X size={18} />
              </button>
              {safeTags.length > 0 && (
                <div className="pz-tags">
                  {safeTags.map((tag) => {
                    const label = tag.label || tag;
                    return <span key={label}>{label}</span>;
                  })}
                </div>
              )}
              <ProductImage
                src={galleryImages ? galleryImages[activeImageIdx] : (activeProduct.localImage || activeProduct.image)}
                alt={activeProduct.name}
                width={1200}
              />
              {galleryImages && (
                <div className="pz-gallery-strip">
                  {galleryImages.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`pz-gallery-thumb${idx === activeImageIdx ? ' pz-gallery-thumb--active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setActiveImageIdx(idx); }}
                      aria-label={`View image ${idx + 1}`}
                    >
                      <img src={img} alt={`${activeProduct.name} ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              )}
              {special && (
                <div className="pz-special-badge">
                  {special.deal === 'discount' && special.discountPct ? `${special.discountPct}% OFF`
                    : special.deal === 'bogo' ? `Buy ${special.bogoX || 1} Get ${special.bogoY || 1} Free`
                    : "This Week's Special"}
                </div>
              )}
            </div>

            {/* White details panel */}
            <div className="pz-details">
              <div className="pz-scroll">
                <span className="pz-code">{activeProduct.code}</span>
                <h2 className="pz-name">{activeProduct.name}</h2>

                {/* Live stock check */}
                <div className="pz-stock-zone">
                  {showStock ? (
                    <div className="pz-stock-result">
                      <div>
                        <span className="pz-stock-label">Stock on hand</span>
                        <span className="pz-stock-num">{liveStock ?? 0}</span>
                      </div>
                      <button className="pz-recheck" type="button" onClick={handleStockCheck}>
                        Check again
                      </button>
                    </div>
                  ) : (
                    <button className="pz-stock-btn" type="button" onClick={handleStockCheck} disabled={stockLoading}>
                      {stockLoading ? <span className="pz-spinner" /> : <Package size={16} />}
                      {stockLoading ? 'Checking live stock…' : 'Check live stock'}
                    </button>
                  )}
                </div>

                {/* Specs */}
                {(product.colour || product.casePack || product.leadTime) && (
                  <div className="pz-specs">
                    {product.colour && <span>Colour: {product.colour}</span>}
                    {product.casePack && <span>{product.casePack}</span>}
                    {product.leadTime && <span>{product.leadTime}</span>}
                  </div>
                )}

                {/* Variant list for grouped products — click to swap image */}
                {isVariantGroup && variants.length > 0 && (
                  <div className="pz-variants">
                    <span className="pz-variants-label">Select a variant</span>
                    <div className="pz-variants-list">
                      {variants.map((v) => {
                        const isSelected = (selectedVariant?.id || product.id) === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`pz-variant-row${isSelected ? ' pz-variant-row--selected' : ''}`}
                            onClick={() => { setSelectedVariant(v); setQty(v.minQty || 1); setActiveImageIdx(0); }}
                          >
                            {v.image && (
                              <img src={v.image} alt={v.name} className="pz-variant-img" />
                            )}
                            <div className="pz-variant-info">
                              <span className="pz-variant-name">{v.name}</span>
                              {v.colour && <span className="pz-variant-colour">{v.colour}</span>}
                            </div>
                            <span className="pz-variant-price">R{Number(v.price || 0).toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {product.tradeNote && <p className="pz-trade-note">{product.tradeNote}</p>}
              </div>

              {/* Fixed buy bar */}
              <div className="pz-buy-bar">
                <div className="pz-price-row">
                  <span className="pz-price">R{activePrice.toFixed(2)}</span>
                  <span className="pz-price-note">incl. VAT · min {activeProduct.minQty || 1}</span>
                </div>
                <div className="pz-qty-row">
                  <div className="qty-stepper" aria-label="Quantity in preview">
                    <button onClick={() => setQty(Math.max(activeProduct.minQty || 1, qty - 1))} type="button" aria-label="Decrease">
                      <Minus size={14} />
                    </button>
                    <ProductQtyInput qty={qty} setQty={setQty} minQty={activeProduct.minQty || 1} />
                    <button onClick={() => setQty(qty + 1)} type="button" aria-label="Increase">
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="pz-total">
                    <span>Total</span>
                    <strong>R{lineTotal}</strong>
                  </div>
                </div>
                {isVariantGroup && !selectedVariant ? (
                  <p style={{ fontSize: '13px', color: '#6B7280', textAlign: 'center', margin: 0 }}>
                    Select a variant above to add to order
                  </p>
                ) : (
                  <button
                    className={`pz-add-btn${justAdded ? ' pz-add-btn--added' : ''}`}
                    onClick={() => {
                      addToCart(activeProduct, qty, null, true);
                      setJustAdded(true);
                      setTimeout(() => setJustAdded(false), 1800);
                    }}
                    type="button"
                  >
                    <ShoppingCart size={16} />
                    {justAdded ? `Added ${qty} ✓` : `Add ${qty} to order`}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}

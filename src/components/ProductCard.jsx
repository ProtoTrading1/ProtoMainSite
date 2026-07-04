import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Loader2, Minus, PackageSearch, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react';
import { buildImageCandidates, optimizedImageUrl } from '../lib/imageUrl';
import { trackEvent } from '../lib/trackEvent';

// At or below this quantity we warn "Low stock". Configurable in one place.
const LOW_STOCK_THRESHOLD = 5;
// Show the limited-stock order disclaimer only below this catalog quantity.
const STOCK_POLICY_THRESHOLD = 20;

function catalogStockQty(product) {
  if (!product) return null;
  const raw = product.stockOnHand ?? product.stockQty;
  if (raw === undefined || raw === null) return null;
  return Number(raw) || 0;
}

function shouldShowStockPolicy(product) {
  if (product?.isVariantGroup && Array.isArray(product.variants) && product.variants.length > 1) {
    return product.variants.some((variant) => {
      const qty = catalogStockQty(variant);
      return qty !== null && qty < STOCK_POLICY_THRESHOLD;
    });
  }
  const qty = catalogStockQty(product);
  return qty !== null && qty < STOCK_POLICY_THRESHOLD;
}

// Customer-facing live stock check. Always hits /api/stock fresh on click — the
// result is never baked in at page load and never cached across page loads.
function StockCheck({ sku }) {
  const [state, setState] = useState({ status: 'idle', qty: null, keepLive: false });

  const check = async () => {
    if (!sku) return;
    setState({ status: 'loading', qty: null, keepLive: false });
    try {
      const res = await fetch(`/api/stock?sku=${encodeURIComponent(sku)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setState({
        status: 'done',
        qty: Number(data.qty) || 0,
        keepLive: !!data.keep_live_when_oos,
      });
    } catch {
      setState({ status: 'error', qty: null, keepLive: false });
    }
  };

  let readout = null;
  if (state.status === 'done') {
    const qty = state.qty;
    if (state.keepLive && qty <= 0) {
      readout = <span className="stock-readout stock-readout--in">Available</span>;
    } else if (qty <= 0) {
      readout = <span className="stock-readout stock-readout--out">Out of stock</span>;
    } else if (qty <= LOW_STOCK_THRESHOLD) {
      readout = <span className="stock-readout stock-readout--low">Low stock: {qty} left</span>;
    } else {
      readout = <span className="stock-readout stock-readout--in">In stock: {qty}</span>;
    }
  } else if (state.status === 'error') {
    readout = (
      <span className="stock-readout stock-readout--error">
        Could not check stock{' '}
        <button type="button" className="stock-retry" onClick={check}>Retry</button>
      </span>
    );
  }

  return (
    <div className="stock-check">
      {state.status === 'idle' || state.status === 'loading' ? (
        <button
          type="button"
          className="check-stock-btn"
          onClick={check}
          disabled={state.status === 'loading' || !sku}
        >
          {state.status === 'loading'
            ? <><Loader2 size={14} className="stock-spin" /> Checking…</>
            : <><PackageSearch size={14} /> Check Stock</>}
        </button>
      ) : null}
      <span className="stock-result" role="status" aria-live="polite">{readout}</span>
    </div>
  );
}

function ProductImage({ src, alt, priority = false, variant = 'card' }) {
  const candidates = buildImageCandidates(src);
  const [imageIdx, setImageIdx] = useState(0);

  useEffect(() => {
    setImageIdx(0);
  }, [src]);

  if (!candidates.length || !candidates[imageIdx]) {
    if (variant === 'card') {
      return (
        <div className="product-image-frame product-image-frame--empty" aria-hidden="true">
          <ImageOff size={28} />
        </div>
      );
    }
    return (
      <div className="pz-image-placeholder" aria-hidden="true">
        <ImageOff size={28} />
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="product-image-frame">
        <img
          className="catalogue-photo"
          src={candidates[imageIdx]}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onError={() => setImageIdx((idx) => idx + 1)}
        />
      </div>
    );
  }

  return (
    <img
      className="pz-photo"
      src={candidates[imageIdx]}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setImageIdx((idx) => idx + 1)}
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

export default function ProductCard({ product, addToCart, cartQty = 0, onCartQtyChange, special, priority = false, initialZoomOpen = false, onZoomClose, onSearchEngage = null }) {
  const isVariantGroup = product?.isVariantGroup === true;
  const variants = product?.variants || [];
  const variantCount = product?.variantCount || variants.length;
  const baseTags = Array.isArray(product?.tags) ? product.tags : [];
  const safeTags = isVariantGroup
    ? [{ label: variantCount > 1 ? `${variantCount} variants` : 'Multiple Variants', bg: '#7F1D1D', color: '#fff' }, ...baseTags]
    : baseTags;
  const safeBadges = Array.isArray(product?.badges) ? product.badges : [];
  const [qty, setQty] = useState(product.minQty || 1);
  const [zoomOpen, setZoomOpen] = useState(initialZoomOpen);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const addButtonRef = useRef(null);

  const activeProduct = selectedVariant || product;
  const galleryImages = Array.isArray(activeProduct.images) && activeProduct.images.length > 1
    ? activeProduct.images
    : null;
  const inCart = cartQty > 0;

  useEffect(() => {
    setSelectedVariant(null);
    setActiveImageIdx(0);
  }, [product?.id]);

  const openPreview = () => {
    onSearchEngage?.();
    setZoomOpen(true);
    trackEvent({
      eventType: 'product_view',
      entityId: product?.id || product?.code,
      entityLabel: product?.name || product?.code,
    });
  };
  const closePreview = () => { setZoomOpen(false); onZoomClose?.(); };

  const handleAdd = () => {
    if (isVariantGroup && !selectedVariant) {
      openPreview();
      return;
    }
    const rect = addButtonRef.current?.getBoundingClientRect();
    const pos = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    addToCart(activeProduct, qty, pos);
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

        {/* Body — footer pinned for equal grid row heights */}
        <div className="product-body">
          <div className="product-card-top">
            <div className="product-meta">
              <span>{product.code}</span>
              {isVariantGroup && variantCount > 1 && (
                <span className="pc-variant-count">{variantCount} options</span>
              )}
            </div>

            <button className="product-title-button" onClick={openPreview} type="button">
              <h3>{product.name}</h3>
            </button>

            {product.originalDescription && (
              <p className="product-desc">{product.originalDescription}</p>
            )}

            {safeBadges.length > 0 && (
              <div className="product-badges">
                {safeBadges.map((b) => <span key={b}>{b}</span>)}
              </div>
            )}
          </div>

          <div className="product-card-footer">
            {activeProduct.price > 0 && (
              <div className="price-row price-row--card">
                <strong>R{Number(activeProduct.price).toFixed(2)}</strong>
                <span>incl. VAT</span>
              </div>
            )}

            <StockCheck sku={product.code || product.barcode || product.sku || product.id} />

            {shouldShowStockPolicy(product) && (
              <p className="product-stock-policy">
                (Limited stock available. Orders exceeding current stock can still be fulfilled — please allow additional time for delivery.)
              </p>
            )}

            <div className="buy-row">
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
                {isVariantGroup ? 'View options' : 'Add'}
              </button>
            </div>
            {inCart && (
              <span className="pc-in-order">In your order: {cartQty}</span>
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
                src={optimizedImageUrl(galleryImages ? galleryImages[activeImageIdx] : (activeProduct.localImage || activeProduct.image))}
                alt={activeProduct.name}
                variant="modal"
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
                      <img src={optimizedImageUrl(img)} alt={`${activeProduct.name} ${idx + 1}`} />
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

                {activeProduct.originalDescription && (
                  <p className="pz-desc">{activeProduct.originalDescription}</p>
                )}

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
                        const isSelected = (selectedVariant?.id || variants[0]?.id) === v.id;
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
                              <span className="pz-variant-code">{v.sku || v.websiteSku || v.code}</span>
                              {v.colour && <span className="pz-variant-colour">{v.colour}</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {product.tradeNote && <p className="pz-trade-note">{product.tradeNote}</p>}

                {activeProduct.price > 0 && (
                  <div className="price-row" style={{ marginTop: 16, marginBottom: 0 }}>
                    <strong>R{Number(activeProduct.price).toFixed(2)}</strong>
                    <span>incl. VAT</span>
                  </div>
                )}

                <div className="pz-stock-check">
                  <StockCheck sku={activeProduct.code || activeProduct.barcode || activeProduct.sku || activeProduct.id} />
                </div>
              </div>

              {/* Fixed buy bar */}
              <div className="pz-buy-bar">
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

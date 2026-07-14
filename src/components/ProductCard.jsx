import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Loader2, Minus, PackageSearch, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react';
import { buildImageCandidates, optimizedImageUrl } from '../lib/imageUrl';
import { trackEvent } from '../lib/trackEvent';
import { stockAdvisoryForQty } from '../lib/stockAdvisory';
import './ProductCard.css';

// At or below this quantity we warn "Low stock". Configurable in one place.
const LOW_STOCK_THRESHOLD = 5;

function productBarcode(product) {
  const explicitBarcode = String(
    product?.barcode
    || product?.ean
    || product?.upc
    || product?.gtin
    || '',
  ).trim();
  if (explicitBarcode) return explicitBarcode;

  const code = String(product?.code || '').trim();
  const sku = String(product?.sku || product?.websiteSku || '').trim();
  if (code && (!sku || code !== sku)) return code;
  return '';
}

function productSku(product) {
  return String(
    product?.sku
    || product?.websiteSku
    || product?.code
    || product?.id
    || '',
  ).trim();
}

function productSkuLabel(product, compact = false) {
  const sku = productSku(product) || '—';
  return compact ? `SKU ${sku}` : `SKU: ${sku}`;
}

function productBarcodeLabel(product, compact = false) {
  const barcode = productBarcode(product) || '—';
  return compact ? `Barcode ${barcode}` : `Barcode: ${barcode}`;
}

function catalogStockQty(product) {
  if (!product) return null;
  const raw = product.stockOnHand ?? product.stockQty;
  if (raw === undefined || raw === null) return null;
  return Number(raw) || 0;
}

function catalogStockBadgeState(product) {
  const qty = catalogStockQty(product);
  if (qty !== null) {
    // Only EXACTLY zero is out of stock — negative SOH is a live backorder
    // line (canonical rule shared with the admin portal).
    // A zero-stock product is orderable (shown "Available to order") only when
    // marked "to order"; keep_live_when_oos alone shows plain "Out of stock".
    if (qty === 0) return product.toOrder ? 'toorder' : 'out';
    if (qty > 0 && qty <= LOW_STOCK_THRESHOLD) return 'low';
    return 'in';
  }
  return product.inStock === false ? 'out' : 'in';
}

function catalogStockBadge(product) {
  if (product?.isVariantGroup && Array.isArray(product.variants) && product.variants.length > 1) {
    const states = product.variants.map((variant) => catalogStockBadgeState(variant));
    if (states.every((state) => state === 'out')) return 'out';
    if (states.some((state) => state === 'low')) return 'low';
    // No in-stock variants, but at least one is orderable-to-order.
    if (states.every((state) => state === 'out' || state === 'toorder') && states.some((state) => state === 'toorder')) return 'toorder';
    return 'in';
  }
  return catalogStockBadgeState(product);
}

function catalogStockState(product) {
  if (!product) return { state: 'in', qty: null, canOrder: true };

  const qty = catalogStockQty(product);
  const state = catalogStockBadge(product);

  // "To order" products remain orderable at zero stock; keep_live_when_oos
  // alone does NOT make a product orderable (it only keeps it visible).
  if (product.toOrder || product.orderableWhenOutOfStock) {
    return { state, qty, canOrder: true };
  }

  if (qty !== null) {
    return { state, qty, canOrder: qty > 0 };
  }

  if (product.inStock === false) {
    return { state, qty: null, canOrder: false };
  }

  return { state, qty, canOrder: true };
}

const STOCK_BADGE_LABEL = {
  in: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
  toorder: 'Available to order',
};

function StockBadge({ product }) {
  const sku = product?.code || product?.barcode || product?.sku || product?.id;
  if (!sku) return null;

  return (
    <div className="pc-stock-slot">
      <StockCheck sku={sku} />
    </div>
  );
}

// Customer-facing live stock check. Always hits /api/stock fresh on click — the
// result is never baked in at page load and never cached across page loads.
function StockCheck({ sku }) {
  const [state, setState] = useState({ status: 'idle', qty: null, toOrder: false });

  const check = async () => {
    if (!sku) return;
    setState({ status: 'loading', qty: null, toOrder: false });
    try {
      const res = await fetch(`/api/stock?sku=${encodeURIComponent(sku)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setState({
        status: 'done',
        qty: Number(data.qty) || 0,
        toOrder: !!data.to_order,
      });
    } catch {
      setState({ status: 'error', qty: null, toOrder: false });
    }
  };

  let readout = null;
  if (state.status === 'done') {
    const qty = state.qty;
    if (state.toOrder && qty <= 0) {
      readout = <span className="stock-readout stock-readout--in">Available to order</span>;
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

function ProductImage({ src, alt, priority = false, className = '', variant = 'card' }) {
  const candidates = buildImageCandidates(src, { variant });
  const [imageIdx, setImageIdx] = useState(0);
  const imgRef = useRef(null);

  useEffect(() => {
    setImageIdx(0);
    const img = imgRef.current;
    if (!img) return;
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '';
    img.style.maxHeight = '';
  }, [src]);

  const normalizeCardImage = (img) => {
    const frame = img.closest('.pc-image-frame');
    if (!frame) return;
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return;
    const styles = getComputedStyle(frame);
    const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const innerH = frame.clientHeight - padY;
    const innerW = frame.clientWidth - padX;
    if (innerW <= 0 || innerH <= 0) return;
    const target = Math.min(innerW, innerH) * 0.96;
    const scale = target / Math.max(w, h);
    img.style.width = `${Math.round(w * scale)}px`;
    img.style.height = `${Math.round(h * scale)}px`;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
  };

  const handleLoad = (event) => {
    if (variant !== 'card') return;
    normalizeCardImage(event.currentTarget);
  };

  useEffect(() => {
    if (variant !== 'card') return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) normalizeCardImage(img);
  }, [src, imageIdx, variant]);

  if (!candidates.length || !candidates[imageIdx]) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', color: '#d1d5db' }}>
        <ImageOff size={28} />
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      className={className || undefined}
      src={candidates[imageIdx]}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchpriority={priority ? 'high' : 'auto'}
      decoding="async"
      onLoad={handleLoad}
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
  const defaultVariant = variants[0] || null;
  const variantCount = product?.variantCount || variants.length;
  const baseTags = Array.isArray(product?.tags) ? product.tags : [];
  const safeTags = isVariantGroup
    ? [{ label: variantCount > 1 ? `${variantCount} variants` : 'Multiple Variants', bg: '#7F1D1D', color: '#fff' }, ...baseTags]
    : baseTags;
  const [qty, setQty] = useState(product.minQty || 1);
  const [zoomOpen, setZoomOpen] = useState(initialZoomOpen);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const addButtonRef = useRef(null);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusedElementRef = useRef(null);

  const activeProduct = selectedVariant || product;
  const galleryImages = Array.isArray(activeProduct.images) && activeProduct.images.length > 1
    ? activeProduct.images
    : null;
  const inCart = cartQty > 0;
  const { canOrder: cardCanOrder } = catalogStockState(product);
  const { canOrder: modalCanOrder } = catalogStockState(activeProduct);
  const cardAdvisory = stockAdvisoryForQty(product, qty);
  const modalAdvisory = stockAdvisoryForQty(activeProduct, qty);

  useEffect(() => {
    setSelectedVariant(null);
    setActiveImageIdx(0);
  }, [product?.id]);

  const selectVariant = (variant) => {
    if (!variant) return;
    setSelectedVariant(variant);
    setQty(variant.minQty || 1);
    setActiveImageIdx(0);
  };

  const openPreview = () => {
    onSearchEngage?.();
    if (isVariantGroup && defaultVariant) {
      selectVariant(defaultVariant);
    }
    setZoomOpen(true);
    trackEvent({
      eventType: 'product_view',
      entityId: product?.id || product?.code,
      entityLabel: product?.name || product?.code,
    });
  };
  const closePreview = () => {
    setZoomOpen(false);
    setSelectedVariant(null);
    onZoomClose?.();
  };

  const handleAdd = () => {
    if (isVariantGroup) {
      openPreview();
      return;
    }
    if (!cardCanOrder) return;
    const rect = addButtonRef.current?.getBoundingClientRect();
    const pos = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    addToCart(activeProduct, qty, pos);
  };

  useEffect(() => {
    if (!zoomOpen) return;
    lastFocusedElementRef.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePreview();
        return;
      }
      if (e.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !modal.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
        return;
      }
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (lastFocusedElementRef.current instanceof HTMLElement) {
        lastFocusedElementRef.current.focus();
      }
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
          <div className="pc-image-frame">
            <ProductImage
              className="pc-product-img"
              src={product.localImage || product.image}
              alt={product.name}
              priority={priority}
            />
          </div>
          <SpecialRibbon special={special} />
          <span className="zoom-cue"><ZoomIn size={13} /> View</span>
        </button>

        {/* Body */}
        <div className="product-body">
          <button className="product-title-button" onClick={openPreview} type="button">
            <h3>{product.name}</h3>
          </button>

          <div className="pc-sku">
            <div className="pc-sku-top">
              <span className="pc-sku-code">{productSkuLabel(product)}</span>
              {isVariantGroup && variantCount > 1 && (
                <span className="pc-variant-count">{variantCount} options</span>
              )}
            </div>
            <span className="pc-barcode-code">{productBarcodeLabel(product)}</span>
          </div>

          <div className="pc-price-block">
            {activeProduct.price > 0 ? (
              <>
                <strong className="pc-price-amount">R{Number(activeProduct.price).toFixed(2)}</strong>
                <span className="pc-price-vat">Incl. VAT</span>
              </>
            ) : null}
          </div>

          <StockBadge product={product} />

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
            <button
              ref={addButtonRef}
              className="add-button"
              onClick={handleAdd}
              type="button"
              disabled={!isVariantGroup && !cardCanOrder}
            >
              <ShoppingCart size={16} />
              {isVariantGroup ? 'View options' : 'Add to Cart'}
            </button>
          </div>
          {cardAdvisory.isOverOrder && (
            <p className="pc-stock-advisory">Only {cardAdvisory.availableStock} in stock &mdash; we&rsquo;ll confirm the extra {cardAdvisory.shortfall} with you.</p>
          )}
          <span className={`pc-in-order${inCart ? '' : ' pc-in-order--empty'}`}>
            {inCart ? `In Your Order: ${cartQty}` : '\u00A0'}
          </span>
        </div>
      </article>

      {/* Zoom modal — rendered at document.body to escape any CSS transform stacking context */}
      {zoomOpen && createPortal(
        <div className="pz-backdrop" onClick={closePreview}>
          <div
            ref={modalRef}
            className="pz-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`pz-name-${activeProduct.id || product.id}`}
            onClick={(e) => e.stopPropagation()}
          >

            {/* Dark image panel */}
            <div className="pz-image-panel">
              <button ref={closeButtonRef} className="pz-close" onClick={closePreview} type="button" aria-label="Close">
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
              <div className="pz-main-image">
                <ProductImage
                  className="pz-main-image-img"
                  variant="modal"
                  src={optimizedImageUrl(galleryImages ? galleryImages[activeImageIdx] : (activeProduct.localImage || activeProduct.image))}
                  alt={activeProduct.name}
                />
              </div>
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
                <div className="pz-code-block">
                  <span className="pz-code">{productSkuLabel(activeProduct)}</span>
                  <span className="pz-code pz-code--secondary">{productBarcodeLabel(activeProduct)}</span>
                </div>
                <h2 className="pz-name" id={`pz-name-${activeProduct.id || product.id}`}>{activeProduct.name}</h2>

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

                {/* "To order" disclaimer — item is orderable even without stock on hand. */}
                {(activeProduct.toOrder || product.toOrder) && (
                  <p className="pz-to-order-note" style={{ margin: '10px 0 0', fontSize: 13, color: '#b45309', fontWeight: 600 }}>
                    ⏳ Available to order — allow extra lead time. Place your order and we’ll confirm timing on your quote.
                  </p>
                )}

                {/* Variant list for grouped products — click to swap image */}
                {isVariantGroup && variants.length > 0 && (
                  <div className="pz-variants">
                    <span className="pz-variants-label">Select a variant</span>
                    <div className="pz-variants-list" role="radiogroup" aria-label="Select a variant">
                      {variants.map((v) => {
                        const isSelected = selectedVariant?.id === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            className={`pz-variant-row${isSelected ? ' pz-variant-row--selected' : ''}`}
                            onClick={() => selectVariant(v)}
                          >
                            {v.image && (
                              <img src={v.image} alt={v.name} className="pz-variant-img" />
                            )}
                            <div className="pz-variant-info">
                              <span className="pz-variant-name">{v.name}</span>
                              <span className="pz-variant-code">{productSkuLabel(v, true)}</span>
                              <span className="pz-variant-barcode">{productBarcodeLabel(v, true)}</span>
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
                {modalAdvisory.isOverOrder && (
                  <p className="pz-stock-advisory">Only {modalAdvisory.availableStock} in stock &mdash; we&rsquo;ll confirm the extra {modalAdvisory.shortfall} with you.</p>
                )}
                {isVariantGroup && !selectedVariant ? (
                  <p style={{ fontSize: '13px', color: '#6B7280', textAlign: 'center', margin: 0 }}>
                    Select a variant above to add to order
                  </p>
                ) : (
                  <button
                    className={`pz-add-btn${justAdded ? ' pz-add-btn--added' : ''}`}
                    disabled={!modalCanOrder}
                    onClick={() => {
                      if (!modalCanOrder) return;
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

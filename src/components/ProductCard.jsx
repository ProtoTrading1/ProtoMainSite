import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Link, Loader2, Minus, PackageSearch, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react';
import { buildImageCandidates, optimizedImageUrl } from '../lib/imageUrl';
import { trackEvent } from '../lib/trackEvent';
import { stockAdvisoryForQty } from '../lib/stockAdvisory';
import { displayProductText } from '../lib/productText';
import { authHeaders } from '../lib/authHeaders';
import { buildProductDetailUrl } from '../lib/productDetailUrl';
import { sellingUnitDetails } from '../../lib/selling-unit.mjs';
import { formatIncomingEta, resolveProductAvailability } from '../../lib/product-availability.mjs';
import './ProductCard.css';

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

function productReferenceLabel(product) {
  const sku = productSku(product);
  const barcode = productBarcode(product);
  if (!barcode || barcode === sku) return `SKU: ${sku || '—'}`;
  return `SKU: ${sku || '—'} | BARCODE: ${barcode}`;
}

function catalogStockQty(product) {
  if (!product) return null;
  const raw = product.stockOnHand ?? product.stockQty;
  if (raw === undefined || raw === null) return null;
  return Number(raw) || 0;
}

function availabilityForProduct(product) {
  if (product?.availability?.state) return product.availability;
  return resolveProductAvailability({
    stockQty: catalogStockQty(product),
    toOrder: !!(product?.toOrder || product?.orderableWhenOutOfStock),
    incoming: product,
  });
}

function groupedAvailability(product) {
  if (product?.isVariantGroup && Array.isArray(product.variants) && product.variants.length > 1) {
    const options = product.variants.map(availabilityForProduct);
    const priority = ['in_stock', 'low_stock', 'landed', 'to_order', 'incoming_preorder', 'incoming'];
    const selected = priority.map((state) => options.find((item) => item.state === state)).find(Boolean)
      || options[0]
      || availabilityForProduct(product);
    return { ...selected, guidance: 'Select an option to check stock', canOrder: options.some((item) => item.canOrder) };
  }
  return availabilityForProduct(product);
}

function catalogStockState(product) {
  if (!product) return resolveProductAvailability();
  return groupedAvailability(product);
}

const STOCK_BADGE_CLASS = {
  in_stock: 'in',
  low_stock: 'low',
  landed: 'landed',
  to_order: 'toorder',
  incoming_preorder: 'incoming',
  incoming: 'incoming',
  out_of_stock: 'out',
};

function orderQuantityLabel(product) {
  const minimum = Math.max(1, Number(product?.minQty) || 1);
  const unit = sellingUnitDetails(product?.unitsOfIssue || 'EACH');
  const parts = [`Minimum ${minimum}`];
  parts.push(unit.label);
  return parts.join(' · ');
}

function StockBadge({ product }) {
  const sku = product?.code || product?.barcode || product?.sku || product?.id;
  if (!sku) return null;
  const availability = catalogStockState(product);
  const badgeClass = STOCK_BADGE_CLASS[availability.state] || 'out';

  return (
    <div className="pc-stock-slot">
      <div className={`pc-orderability pc-orderability--${badgeClass}`}>
        <span>{availability.label}</span>
        <small>{availability.guidance}</small>
      </div>
      <StockCheck sku={sku} />
    </div>
  );
}

// Customer-facing live stock check. Always hits /api/stock fresh on click — the
// result is never baked in at page load and never cached across page loads.
function StockCheck({ sku, autoCheck = false }) {
  const [state, setState] = useState({ status: 'idle', qty: null, availability: null });

  const check = useCallback(async () => {
    if (!sku) return;
    setState({ status: 'loading', qty: null, availability: null });
    try {
      const res = await fetch(`/api/stock?sku=${encodeURIComponent(sku)}`, {
        cache: 'no-store',
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setState({
        status: 'done',
        qty: Number(data.qty) || 0,
        availability: data.availability || null,
      });
    } catch {
      setState({ status: 'error', qty: null, availability: null });
    }
  }, [sku]);

  // A customer opening the detail view is already evaluating the product.
  // Start the same authenticated, no-store live lookup immediately so the
  // number is usually ready before they reach the quantity controls. Product
  // cards remain click-to-check to avoid a request storm across the grid.
  useEffect(() => {
    if (autoCheck) void check();
  }, [autoCheck, check]);

  let readout = null;
  if (state.status === 'done') {
    const qty = state.qty;
    const live = state.availability || resolveProductAvailability({ stockQty: qty });
    if (live.state === 'in_stock') {
      readout = <span className="stock-readout stock-readout--in">In stock: {qty}</span>;
    } else if (live.state === 'low_stock') {
      readout = <span className="stock-readout stock-readout--low">Low stock: {qty} left</span>;
    } else {
      readout = <span className={`stock-readout stock-readout--${live.canOrder ? 'in' : 'out'}`}>{live.label}</span>;
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
            : <><PackageSearch size={14} /> Check live stock</>}
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

function ProductCard({ product, addToCart, cartQty = 0, special, priority = false, initialZoomOpen = false, onZoomClose, onSearchEngage = null, onProductPreview = null }) {
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
  const [linkCopied, setLinkCopied] = useState(false);
  const addButtonRef = useRef(null);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusedElementRef = useRef(null);

  const activeProduct = selectedVariant || product;
  const galleryImages = Array.isArray(activeProduct.images) && activeProduct.images.length > 1
    ? activeProduct.images
    : null;
  const inCart = cartQty > 0;
  const cardAvailability = catalogStockState(product);
  const modalAvailability = catalogStockState(activeProduct);
  const cardCanOrder = cardAvailability.canOrder;
  const modalCanOrder = modalAvailability.canOrder;
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
    trackEvent({
      eventType: 'product_view',
      entityId: product?.id || product?.code,
      entityLabel: product?.name || product?.code,
    });
    if (onProductPreview) {
      onProductPreview(product);
      return;
    }
    if (isVariantGroup && defaultVariant) {
      selectVariant(defaultVariant);
    }
    setZoomOpen(true);
  };
  const closePreview = useCallback(() => {
    setZoomOpen(false);
    setSelectedVariant(null);
    onZoomClose?.();
  }, [onZoomClose]);

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

  const shareProduct = async () => {
    const url = buildProductDetailUrl(activeProduct);
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: activeProduct.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch (error) {
      if (error?.name !== 'AbortError') setLinkCopied(false);
    }
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
  }, [closePreview, zoomOpen]);

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
            <h3>{displayProductText(product.name)}</h3>
          </button>

          <div className="pc-sku">
            <div className="pc-sku-top">
              <span className="pc-sku-code">{productReferenceLabel(product)}</span>
              {isVariantGroup && variantCount > 1 && (
                <span className="pc-variant-count">{variantCount} options</span>
              )}
            </div>
            <span className="pc-order-quantity">{orderQuantityLabel(activeProduct)}</span>
          </div>

          <div className="pc-price-block">
            {activeProduct.price > 0 ? (
              <>
                <strong className="pc-price-amount">R{Number(activeProduct.price).toFixed(2)}</strong>
                <span className="pc-price-vat">Incl. VAT · {sellingUnitDetails(activeProduct.unitsOfIssue).priceSuffix}</span>
              </>
            ) : null}
          </div>

          <StockBadge product={product} />

          <div className="buy-row">
            <div className="qty-stepper" aria-label="Quantity">
              <button
                onClick={() => setQty((current) => Math.max(product.minQty || 1, current - 1))}
                type="button"
                aria-label={`Decrease quantity from ${qty}`}
                disabled={qty <= (product.minQty || 1)}
              >
                <Minus size={14} />
              </button>
              <ProductQtyInput qty={qty} setQty={setQty} minQty={product.minQty || 1} />
              <button
                onClick={() => setQty((current) => Math.min(9999, current + 1))}
                type="button"
                aria-label={`Increase quantity from ${qty}`}
                disabled={qty >= 9999}
              >
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
                  <button type="button" className="pz-share-btn" onClick={shareProduct}>
                    <Link size={14} aria-hidden="true" /> {linkCopied ? 'Link copied' : 'Share product'}
                  </button>
                </div>
                <h2 className="pz-name" id={`pz-name-${activeProduct.id || product.id}`}>{displayProductText(activeProduct.name)}</h2>

                {activeProduct.originalDescription && (
                  <p className="pz-desc">{displayProductText(activeProduct.originalDescription)}</p>
                )}

                {/* Specs */}
                {(product.colour || product.packDescription || product.leadTime) && (
                  <div className="pz-specs">
                    {product.colour && <span>Colour: {product.colour}</span>}
                    {product.packDescription && <span>{product.packDescription}</span>}
                    {product.leadTime && <span>{product.leadTime}</span>}
                  </div>
                )}

                <p className="pz-order-quantity">{orderQuantityLabel(activeProduct)}</p>

                {/* "To order" disclaimer — item is orderable even without stock on hand. */}
                {modalAvailability.state === 'to_order' && (
                  <p className="pz-to-order-note" style={{ margin: '10px 0 0', fontSize: 13, color: '#b45309', fontWeight: 600 }}>
                    ⏳ Available to order — allow extra lead time. Place your order and we’ll confirm timing on your quote.
                  </p>
                )}
                {modalAvailability.state === 'landed' && (
                  <p className="pz-to-order-note" style={{ margin: '10px 0 0', fontSize: 13, color: '#245aa7', fontWeight: 600 }}>
                    🚢 This stock has landed and is being received. You can add it now; final quantity and timing will be confirmed on your quotation.
                  </p>
                )}
                {['incoming', 'incoming_preorder'].includes(modalAvailability.state) && (
                  <p className="pz-to-order-note" style={{ margin: '10px 0 0', fontSize: 13, color: '#245aa7', fontWeight: 600 }}>
                    🚢 Stock is on the way{modalAvailability.incomingEta ? ` and expected ${formatIncomingEta(modalAvailability.incomingEta)}` : ''}.
                    {modalAvailability.canOrder ? ' Pre-orders are open and timing will be confirmed on your quotation.' : ' Pre-orders are not open yet.'}
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
                    <span>incl. VAT · {sellingUnitDetails(activeProduct.unitsOfIssue).priceSuffix}</span>
                  </div>
                )}

                <div className="pz-stock-check">
                  <StockCheck
                    sku={activeProduct.code || activeProduct.barcode || activeProduct.sku || activeProduct.id}
                    autoCheck
                  />
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

export default memo(ProductCard);

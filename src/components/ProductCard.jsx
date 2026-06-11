import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Minus, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react';
import { buildImageCandidates, optimizedImageUrl } from '../lib/imageUrl';

function ProductImage({ src, alt, width = 400, priority = false }) {
  const candidates = buildImageCandidates(src);
  const [imageIdx, setImageIdx] = useState(0);

  useEffect(() => {
    setImageIdx(0);
  }, [src]);

  if (!candidates.length || !candidates[imageIdx]) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', color: '#d1d5db' }}>
        <ImageOff size={28} />
      </div>
    );
  }

  return (
    <img
      src={candidates[imageIdx]}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchpriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setImageIdx((idx) => idx + 1)}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
  const isVariantGroup = product?.isVariantGroup === true;
  const variants = product?.variants || [];
  const baseTags = Array.isArray(product?.tags) ? product.tags : [];
  const safeTags = isVariantGroup
    ? [{ label: 'Multiple Variants', bg: '#7F1D1D', color: '#fff' }, ...baseTags]
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

  const openPreview = () => setZoomOpen(true);
  const closePreview = () => { setZoomOpen(false); onZoomClose?.(); };

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

          {activeProduct.price > 0 && (
            <div className="price-row">
              <strong>R{Number(activeProduct.price).toFixed(2)}</strong>
              <span>excl. VAT</span>
            </div>
          )}

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
                src={optimizedImageUrl(galleryImages ? galleryImages[activeImageIdx] : (activeProduct.localImage || activeProduct.image))}
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
                    <span>excl. VAT</span>
                  </div>
                )}
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

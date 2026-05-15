import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Package, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react';
import { checkStock } from '../lib/products';

function TrimmedProductImage({ src, alt }) {
  const isRemoteCatalogueImage = String(src || '').startsWith('http');
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    setDisplaySrc(src);
    if (!isRemoteCatalogueImage || !src) return;

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        ctx.drawImage(image, 0, 0);

        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let minX = width, minY = height, maxX = 0, maxY = 0;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const a = data[i + 3];
            const isWhite = data[i] > 246 && data[i + 1] > 246 && data[i + 2] > 246;
            if (a > 20 && !isWhite) {
              minX = Math.min(minX, x); minY = Math.min(minY, y);
              maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
          }
        }

        if (maxX <= minX || maxY <= minY) return;
        const pad = Math.round(Math.min(width, height) * 0.045);
        const cx = Math.max(0, minX - pad);
        const cy = Math.max(0, minY - pad);
        const cw = Math.min(width - cx, maxX - minX + pad * 2);
        const ch = Math.min(height - cy, maxY - minY + pad * 2);
        if (cw < width * 0.2 || ch < height * 0.2) return;

        const out = document.createElement('canvas');
        out.width = cw; out.height = ch;
        const outCtx = out.getContext('2d');
        if (!outCtx) return;
        outCtx.drawImage(image, cx, cy, cw, ch, 0, 0, cw, ch);
        if (!cancelled) setDisplaySrc(out.toDataURL('image/png'));
      } catch {
        if (!cancelled) setDisplaySrc(src);
      }
    };

    image.onerror = () => { if (!cancelled) setDisplaySrc(src); };
    image.src = src;
    return () => { cancelled = true; };
  }, [src, isRemoteCatalogueImage]);

  return (
    <img
      className={isRemoteCatalogueImage ? 'catalogue-photo trimmed-catalogue-photo' : ''}
      src={displaySrc}
      alt={alt}
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
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

export default function ProductCard({ product, addToCart, cartQty = 0, onCartQtyChange }) {
  const [qty, setQty] = useState(product.minQty || 1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [liveStock, setLiveStock] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const addButtonRef = useRef(null);

  const lineTotal = (product.price * qty).toFixed(2);
  const inCart = cartQty > 0;

  const openPreview = () => setZoomOpen(true);
  const closePreview = () => { setZoomOpen(false); setShowStock(false); setLiveStock(null); };

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
          {product.tags?.length > 0 && (
            <div className="tag-row">
              {product.tags.map((tag) => {
                const label = tag.label || tag;
                return (
                  <span key={label} style={tag.bg ? { backgroundColor: tag.bg, color: tag.color } : undefined}>
                    {label}
                  </span>
                );
              })}
            </div>
          )}
          <TrimmedProductImage src={product.localImage || product.image} alt={product.name} />
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

          {product.badges?.length > 0 && (
            <div className="product-badges">
              {product.badges.map((b) => <span key={b}>{b}</span>)}
            </div>
          )}

          <div className="price-row">
            <strong>R{product.price.toFixed(2)}</strong>
            <span>excl. VAT · min {product.minQty || 1}</span>
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
              {product.tags?.length > 0 && (
                <div className="pz-tags">
                  {product.tags.map((tag) => {
                    const label = tag.label || tag;
                    return <span key={label}>{label}</span>;
                  })}
                </div>
              )}
              <TrimmedProductImage src={product.localImage || product.image} alt={product.name} />
            </div>

            {/* White details panel */}
            <div className="pz-details">
              <div className="pz-scroll">
                <span className="pz-code">{product.code}</span>
                <h2 className="pz-name">{product.name}</h2>

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
                {(product.category || product.colour || product.casePack || product.leadTime) && (
                  <div className="pz-specs">
                    {product.category && <span>{product.category}</span>}
                    {product.colour && <span>Colour: {product.colour}</span>}
                    {product.casePack && <span>{product.casePack}</span>}
                    {product.leadTime && <span>{product.leadTime}</span>}
                  </div>
                )}

                {product.tradeNote && <p className="pz-trade-note">{product.tradeNote}</p>}
              </div>

              {/* Fixed buy bar */}
              <div className="pz-buy-bar">
                <div className="pz-price-row">
                  <span className="pz-price">R{product.price.toFixed(2)}</span>
                  <span className="pz-price-note">excl. VAT · min {product.minQty || 1}</span>
                </div>
                <div className="pz-qty-row">
                  <div className="qty-stepper" aria-label="Quantity in preview">
                    <button onClick={() => setQty(Math.max(product.minQty || 1, qty - 1))} type="button" aria-label="Decrease">
                      <Minus size={14} />
                    </button>
                    <ProductQtyInput qty={qty} setQty={setQty} minQty={product.minQty || 1} />
                    <button onClick={() => setQty(qty + 1)} type="button" aria-label="Increase">
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="pz-total">
                    <span>Total</span>
                    <strong>R{lineTotal}</strong>
                  </div>
                </div>
                <button className="pz-add-btn" onClick={() => { handleAdd(); closePreview(); }} type="button">
                  <ShoppingCart size={16} />
                  Add {qty} to order
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}

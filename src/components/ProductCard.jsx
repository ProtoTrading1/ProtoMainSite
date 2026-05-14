import { useEffect, useRef, useState } from 'react';
import { Clock3, Minus, Package, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react';

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
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const alpha = data[index + 3];
            const red = data[index];
            const green = data[index + 1];
            const blue = data[index + 2];
            const isWhiteBackground = red > 246 && green > 246 && blue > 246;

            if (alpha > 20 && !isWhiteBackground) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        if (maxX <= minX || maxY <= minY) return;

        const padding = Math.round(Math.min(width, height) * 0.045);
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropW = Math.min(width - cropX, maxX - minX + padding * 2);
        const cropH = Math.min(height - cropY, maxY - minY + padding * 2);

        if (cropW < width * 0.2 || cropH < height * 0.2) return;

        const output = document.createElement('canvas');
        output.width = cropW;
        output.height = cropH;
        const outputCtx = output.getContext('2d');
        if (!outputCtx) return;
        outputCtx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        if (!cancelled) setDisplaySrc(output.toDataURL('image/png'));
      } catch {
        if (!cancelled) setDisplaySrc(src);
      }
    };

    image.onerror = () => {
      if (!cancelled) setDisplaySrc(src);
    };

    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, isRemoteCatalogueImage]);

  return (
    <img
      className={isRemoteCatalogueImage ? 'catalogue-photo trimmed-catalogue-photo' : ''}
      src={displaySrc}
      alt={alt}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}

function ProductQtyInput({ qty, setQty, minQty }) {
  const [draftQty, setDraftQty] = useState(String(qty));

  useEffect(() => {
    setDraftQty(String(qty));
  }, [qty]);

  const commitQty = () => {
    const nextQty = Math.max(minQty || 1, Math.min(9999, Number(draftQty) || minQty || 1));
    setDraftQty(String(nextQty));
    setQty(nextQty);
  };

  return (
    <input
      aria-label="Quantity to add"
      inputMode="numeric"
      min={minQty || 1}
      max="9999"
      type="number"
      value={draftQty}
      onBlur={commitQty}
      onChange={(event) => setDraftQty(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export default function ProductCard({ product, addToCart, cartQty = 0, onCartQtyChange }) {
  const [qty, setQty] = useState(product.minQty || 1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const addButtonRef = useRef(null);

  const lineTotal = (product.price * qty).toFixed(2);
  const inCart = cartQty > 0;

  const openPreview = () => setZoomOpen(true);
  const closePreview = () => setZoomOpen(false);

  const handleAdd = () => {
    const rect = addButtonRef.current?.getBoundingClientRect();
    const pos = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    addToCart(product, qty, pos);
  };

  return (
    <article className="product-card">
      <button className="product-image product-image-button" onClick={openPreview} type="button" aria-label={`Zoom ${product.name}`}>
        <div className="tag-row">
          {product.tags?.map((tag) => {
            const label = tag.label || tag;
            return <span key={label} style={tag.bg ? { backgroundColor: tag.bg, color: tag.color } : undefined}>{label}</span>;
          })}
        </div>
        <TrimmedProductImage src={product.localImage || product.image} alt={product.name} />
        <span className="zoom-cue"><ZoomIn size={14} /> View</span>
      </button>
      <div className="product-body">
        <div className="product-meta">
          <span>{product.code}</span>
          <strong>{product.inStock ? 'In stock' : 'Confirm stock'}</strong>
        </div>
        <button className="product-title-button" onClick={openPreview} type="button">
          <h3>{product.name}</h3>
        </button>
        <div className="product-badges">
          {product.badges?.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
        <div className="trade-specs">
          <div>
            <Package size={14} />
            <span>{product.casePack || 'Trade pack'}</span>
          </div>
          <div>
            <Clock3 size={14} />
            <span>{product.leadTime || 'Confirm stock'}</span>
          </div>
        </div>
        <div className="product-detail-row">
          <span>{product.marginCue}</span>
          <span>Min {product.minQty || 1}</span>
        </div>
        <p className="product-trade-note">{product.tradeNote || 'Wholesale quote item'}</p>
        <button className="view-product-link" onClick={openPreview} type="button">
          View details and order smoother
        </button>
        <div className="product-colour-row">
          {product.colour && <span>{product.colour}</span>}
          {product.size && <span>{product.size}</span>}
          {product.style && <span>{product.style}</span>}
        </div>
        <div className="price-row">
          <strong>R{product.price.toFixed(2)}</strong>
          <span>excl. VAT</span>
        </div>
        <div className="buy-row">
          {inCart ? (
            <div className="cart-in-control">
              <button onClick={() => onCartQtyChange(product, cartQty - 1)} type="button" aria-label="Remove one from order">
                <Minus size={15} />
              </button>
              <span>{cartQty}</span>
              <button onClick={() => onCartQtyChange(product, cartQty + 1)} type="button" aria-label="Add one more to order">
                <Plus size={15} />
              </button>
            </div>
          ) : (
            <>
              <div className="qty-stepper" aria-label="Quantity selector">
                <button onClick={() => setQty(Math.max(product.minQty || 1, qty - 1))} type="button" aria-label="Decrease quantity">
                  <Minus size={14} />
                </button>
                <ProductQtyInput qty={qty} setQty={setQty} minQty={product.minQty || 1} />
                <button onClick={() => setQty(qty + 1)} type="button" aria-label="Increase quantity">
                  <Plus size={14} />
                </button>
              </div>
              <button ref={addButtonRef} className="add-button" onClick={handleAdd} type="button">
                <ShoppingCart size={16} />
                Add to order
              </button>
            </>
          )}
        </div>
      </div>
      {zoomOpen && (
        <div className="product-zoom-backdrop" onClick={closePreview}>
          <section className="product-zoom-modal" onClick={(event) => event.stopPropagation()}>
            <button className="product-zoom-close" onClick={closePreview} type="button" aria-label="Close product preview">
              <X size={20} />
            </button>
            <div className="product-zoom-image">
              <TrimmedProductImage src={product.localImage || product.image} alt={product.name} />
            </div>
            <div className="product-zoom-details">
              <span className="eyebrow">{product.code}</span>
              <h2>{product.name}</h2>
              <div className="product-zoom-meta">
                <span>{product.inStock ? 'In stock' : 'Confirm stock'}</span>
                <span>{product.leadTime || 'Confirm quantity'}</span>
                <span>Trade quote item</span>
              </div>
              <div className="product-zoom-price">
                <strong>R{product.price.toFixed(2)}</strong>
                <span>excl. VAT</span>
              </div>
              <p>{product.tradeNote || 'Wholesale quote item'}</p>
              <div className="product-zoom-buy-row">
                <div className="qty-stepper" aria-label="Quantity selector in preview">
                  <button onClick={() => setQty(Math.max(product.minQty || 1, qty - 1))} type="button" aria-label="Decrease quantity">
                    <Minus size={14} />
                  </button>
                  <ProductQtyInput qty={qty} setQty={setQty} minQty={product.minQty || 1} />
                  <button onClick={() => setQty(qty + 1)} type="button" aria-label="Increase quantity">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="product-zoom-line-total">
                  <span>Current line</span>
                  <strong>R{lineTotal}</strong>
                </div>
              </div>
              <button className="primary-order-button" onClick={() => { handleAdd(); closePreview(); }} type="button">
                <ShoppingCart size={17} />
                Add {qty} to order
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}

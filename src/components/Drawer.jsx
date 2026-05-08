import React, { useEffect, useState } from 'react';
import { FileText, Lock, PackageCheck, ShieldCheck, Trash2 } from 'lucide-react';

const MIN_ORDER = 1000;

function QuantityInput({ item, updateQty }) {
  const [draftQty, setDraftQty] = useState(String(item.qty));

  useEffect(() => {
    setDraftQty(String(item.qty));
  }, [item.qty]);

  const commitQty = () => {
    const nextQty = Math.max(1, Math.min(9999, Number(draftQty) || 1));
    setDraftQty(String(nextQty));
    updateQty(item.product.id, nextQty);
  };

  return (
    <input
      aria-label={`Quantity for ${item.product.code}`}
      inputMode="numeric"
      min="1"
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

export default function Drawer({ cartItems, cartTotal, removeFromCart, updateQty, clearCart, sendOrderEmail }) {
  const progress = Math.min((cartTotal / MIN_ORDER) * 100, 100);
  const remaining = Math.max(0, MIN_ORDER - cartTotal);
  const isReady = cartTotal >= MIN_ORDER;
  const vatEstimate = cartTotal * 0.15;
  const inclVatEstimate = cartTotal + vatEstimate;

  return (
    <div className="order-drawer">
      <div className="drawer-header">
        <div>
          <span className="eyebrow">Wholesale order</span>
          <h2>My Order</h2>
          <p>{cartItems.length ? `${cartItems.length} quote line items` : 'No items added yet'}</p>
        </div>
        {isReady && <span className="ready-pill">Ready</span>}
      </div>

      <div className="drawer-items">
        {cartItems.length === 0 && (
          <div className="drawer-empty">
            <ShieldCheck size={30} />
            <strong>Start a trade order</strong>
            <span>Add products from the catalogue to build a quote request.</span>
          </div>
        )}

        {cartItems.map((item) => (
          <div className="drawer-line" key={item.product.id}>
            <div className="drawer-thumb">
              <img src={item.product.image} alt={item.product.name} />
            </div>
            <div className="drawer-line-body">
              <h3>{item.product.name}</h3>
              <span>{item.product.code}</span>
              <div className="drawer-line-footer">
                <strong>R{(item.product.price * item.qty).toFixed(2)}</strong>
                <div className="mini-stepper">
                  <button onClick={() => updateQty(item.product.id, item.qty - 1)} type="button">-</button>
                  <QuantityInput item={item} updateQty={updateQty} />
                  <button onClick={() => updateQty(item.product.id, item.qty + 1)} type="button">+</button>
                </div>
                <button className="remove-button" onClick={() => removeFromCart(item.product.id)} type="button" aria-label="Remove item">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="drawer-footer">
        <div className="subtotal-row">
          <span>Subtotal excl. VAT</span>
          <strong>R{cartTotal.toFixed(2)}</strong>
        </div>
        <div className="drawer-totals">
          <div><span>VAT estimate</span><strong>R{vatEstimate.toFixed(2)}</strong></div>
          <div><span>Indicative incl. VAT</span><strong>R{inclVatEstimate.toFixed(2)}</strong></div>
        </div>
        <div className="minimum-card">
          <div className="minimum-copy">
            <span>{isReady ? 'Minimum reached' : 'Minimum order'}</span>
            <strong>{isReady ? 'Ready to submit' : `R${remaining.toFixed(2)} remaining`}</strong>
          </div>
          <div className="progress-track">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
        {isReady ? (
          <button className="primary-order-button" onClick={sendOrderEmail} type="button">
            <FileText size={17} />
            Submit quote request
          </button>
        ) : (
          <div className="locked-order-button">
            <Lock size={15} />
            Add more products to submit
          </div>
        )}
        <button className="clear-button" onClick={() => {
          if (clearCart) clearCart();
          else cartItems.forEach((item) => removeFromCart(item.product.id));
        }} type="button">
          <Trash2 size={13} />
          Clear order
        </button>
        <div className="drawer-trust">
          <PackageCheck size={14} />
          Stock, VAT and delivery are confirmed by reply.
        </div>
        <ol className="quote-steps">
          <li>Add trade products</li>
          <li>Reach the minimum</li>
          <li>Send for confirmation</li>
        </ol>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Lock, PackageCheck, ShoppingCart, Trash2, X } from 'lucide-react';
import CheckoutModal from './CheckoutModal';
import { optimizedImageUrl } from '../lib/imageUrl';

const MIN_ORDER = 1000;

function formatCartExpiry(remainingMs) {
  if (remainingMs === null || remainingMs === undefined) return '';
  if (remainingMs <= 0) return 'expired';

  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`;
  return `${hours}h ${minutes}m left`;
}

function QuantityInput({ item, updateQty }) {
  const maxQty = item.product.stockQty || 9999;
  const [draftQty, setDraftQty] = useState(() => String(item.qty));
  const commitQty = () => {
    const nextQty = Math.max(1, Math.min(maxQty, Number(draftQty) || 1));
    setDraftQty(String(nextQty));
    updateQty(item.product.id, nextQty);
  };

  return (
    <input
      aria-label={`Quantity for ${item.product.code}`}
      inputMode="numeric"
      min="1"
      max={maxQty}
      type="number"
      value={draftQty}
      onBlur={commitQty}
      onChange={(e) => setDraftQty(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

export default function Drawer({
  cartItems,
  cartTotal,
  removeFromCart,
  updateQty,
  clearCart,
  sendOrderEmail,
  customer,
  autoCloseProgress = 0,
  showAutoCloseBar = false,
  cartExpiryRemainingMs = null,
  cartExpiryTone = 'ok',
  onClose,
}) {
  const progress = Math.min((cartTotal / MIN_ORDER) * 100, 100);
  const remaining = Math.max(0, MIN_ORDER - cartTotal);
  const isReady = cartTotal >= MIN_ORDER;
  const hasExpiry = cartItems.length > 0 && cartExpiryRemainingMs !== null;
  const expiryLabel = formatCartExpiry(cartExpiryRemainingMs);
  const showExpiryNote = hasExpiry && cartExpiryTone !== 'ok';

  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [showCourierPicker, setShowCourierPicker] = useState(false);
  const [courierChoice, setCourierChoice] = useState(null);
  const [customerNotes, setCustomerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const itemsRef = useRef(null);

  const inclVatEstimate = cartTotal;
  const discountAmount = appliedPromo?.discountAmount || 0;
  const estimatedTotal = Math.max(0, inclVatEstimate - discountAmount);

  useEffect(() => {
    setAppliedPromo(null);
  }, [cartTotal]);

  useEffect(() => {
    const el = itemsRef.current;
    if (!el || !cartItems.length) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [cartItems]);

  const handleSubmitClick = () => {
    setShowCheckoutModal(true);
  };

  const handleCheckoutContinue = () => {
    setShowCheckoutModal(false);
    setShowCourierPicker(true);
    setCourierChoice(null);
    setCustomerNotes('');
  };

  const handleConfirmCourier = async () => {
    setSubmitting(true);
    try {
      await sendOrderEmail({
        courierChoice,
        customerNotes: customerNotes.trim(),
        promo: appliedPromo,
      });
      setShowCourierPicker(false);
      setCourierChoice(null);
      setCustomerNotes('');
      setAppliedPromo(null);
    } finally {
      setSubmitting(false);
    }
  };

  const closeCourierPicker = () => {
    setShowCourierPicker(false);
    setCourierChoice(null);
    setCustomerNotes('');
  };

  return (
    <div className="order-drawer" style={{ position: 'relative' }}>
      <div className="drawer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2>My Order</h2>
          {cartItems.length > 0 && (
            <span style={{ fontSize: '11px', fontWeight: '700', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '2px 7px', borderRadius: '999px' }}>
              {cartItems.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isReady && <span className="ready-pill">Ready</span>}
          {hasExpiry && (
            <span className={`cart-expiry-pill cart-expiry-pill--${cartExpiryTone}`}>
              Cart expires: {expiryLabel}
            </span>
          )}
          {onClose && (
            <button onClick={onClose} type="button" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }} aria-label="Close cart">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {showAutoCloseBar && (
        <div className={`drawer-auto-close drawer-auto-close--${cartExpiryTone}`} aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(100, autoCloseProgress))}%` }} />
        </div>
      )}

      <div className="drawer-items" ref={itemsRef}>
        {cartItems.length === 0 && (
          <div className="drawer-empty">
            <div className="drawer-empty-icon"><ShoppingCart size={22} /></div>
            <strong>Your basket is empty</strong>
            <span>Browse the catalogue and add wholesale lines to build your quote.</span>
          </div>
        )}
        {cartItems.map((item) => (
          <div className="drawer-line" key={item.product.id}>
            <div className="drawer-thumb">
              <img src={optimizedImageUrl(item.product.image)} alt={item.product.name} loading="lazy" decoding="async" />
            </div>
            <div className="drawer-line-body">
              <h3>{item.product.name}</h3>
              <span>{item.product.code}</span>
              <div className="drawer-line-footer">
                <strong>R{(item.product.price * item.qty).toFixed(2)}</strong>
                <div className="mini-stepper">
                  <button
                    onClick={() => updateQty(item.product.id, item.qty - 1)}
                    type="button"
                    aria-label={`Decrease quantity for ${item.product.name}`}
                  >
                    -
                  </button>
                  <QuantityInput key={`${item.product.id}-${item.qty}`} item={item} updateQty={updateQty} />
                  <button
                    onClick={() => updateQty(item.product.id, item.qty + 1)}
                    type="button"
                    aria-label={`Increase quantity for ${item.product.name}`}
                  >
                    +
                  </button>
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
          <span>Subtotal incl. VAT</span>
          <strong>R{inclVatEstimate.toFixed(2)}</strong>
        </div>
        {appliedPromo && (
          <>
            <div className="subtotal-row drawer-promo-row">
              <span>Promo ({appliedPromo.code}, {appliedPromo.discountPct}%)</span>
              <strong>-R{discountAmount.toFixed(2)}</strong>
            </div>
            <div className="subtotal-row drawer-estimated-total">
              <span>Estimated total</span>
              <strong>R{estimatedTotal.toFixed(2)}</strong>
            </div>
          </>
        )}
        {showExpiryNote && (
          <div className={`cart-expiry-note cart-expiry-note--${cartExpiryTone}`}>
            <span>Inactivity timer</span>
            <strong>
              {cartExpiryTone === 'danger'
                ? `Expires soon (${expiryLabel})`
                : `Reset by updating cart (${expiryLabel})`}
            </strong>
          </div>
        )}
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
          <button className="primary-order-button" onClick={handleSubmitClick} type="button">
            <ShoppingCart size={17} />
            Submit order request
          </button>
        ) : (
          <button className="locked-order-button" type="button" disabled aria-disabled="true">
            <Lock size={15} />
            Add more products to submit
          </button>
        )}
        <button className="clear-button" onClick={() => { if (clearCart) clearCart(); else cartItems.forEach((item) => removeFromCart(item.product.id)); }} type="button">
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

      <CheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        cartSubtotal={cartTotal}
        customer={customer}
        appliedPromo={appliedPromo}
        onPromoApplied={setAppliedPromo}
        onPromoClear={() => setAppliedPromo(null)}
        onKeepShopping={() => setShowCheckoutModal(false)}
        onContinue={handleCheckoutContinue}
      />

      {showCourierPicker && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.85)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 300, borderRadius: 'inherit' }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '24px 20px 32px', maxHeight: '85%', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 17, color: '#0f172a', marginBottom: 6 }}>How will your order be shipped?</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Select a delivery option before we send your quote request.</div>
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              {[
                { key: 'own', icon: '🚚', title: "I'll use my own courier", desc: 'You arrange collection or delivery.' },
                { key: 'proto', icon: '📦', title: 'Proto Trading delivers', desc: 'We will arrange delivery and include the cost in your quote.' },
              ].map(({ key, icon, title, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCourierChoice(key)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', border: `2px solid ${courierChoice === key ? '#0f172a' : '#e2e8f0'}`, borderRadius: 12, background: courierChoice === key ? '#f8fafc' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s' }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{desc}</div>
                  </div>
                  {courierChoice === key && <span style={{ marginLeft: 'auto', color: '#0f172a', fontSize: 18, flexShrink: 0 }}>✓</span>}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 8 }}>
                Order notes (optional)
              </span>
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Anything we should know about delivery, timing, or your order…"
                rows={3}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', color: '#0f172a', background: '#fff', boxSizing: 'border-box' }}
              />
            </label>

            <button
              type="button"
              onClick={handleConfirmCourier}
              disabled={!courierChoice || submitting}
              style={{ width: '100%', padding: '13px', background: (!courierChoice || submitting) ? '#e2e8f0' : '#0f172a', color: (!courierChoice || submitting) ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: (!courierChoice || submitting) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 8, transition: 'all 0.15s' }}
            >
              {submitting ? 'Submitting…' : 'Confirm & Submit Quote'}
            </button>
            <button type="button" onClick={closeCourierPicker} style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

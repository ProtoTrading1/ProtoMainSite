import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  Loader2,
  Package,
  PackageCheck,
  ShieldAlert,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import CheckoutModal from './CheckoutModal';
import { optimizedImageUrl } from '../lib/imageUrl';
import { stockAdvisoryForQty } from '../lib/stockAdvisory';

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

function QuantityInput({ item, updateQty, disabled = false }) {
  // Over-ordering is allowed (backorder request); the shortfall is surfaced by
  // the per-line advisory below, so the input only enforces a sane ceiling.
  const maxQty = 9999;
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
      disabled={disabled}
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
  cartSyncStatus = 'local',
  onRetryCartSync,
  cartReady = true,
  onClose,
  onContinueShopping,
  revealItemRequest = null,
  initialScrollTop = 0,
  onRevealItemHandled,
  onScrollPositionChange,
}) {
  const progress = Math.min((cartTotal / MIN_ORDER) * 100, 100);
  const remaining = Math.max(0, MIN_ORDER - cartTotal);
  const isReady = cartTotal >= MIN_ORDER;
  const hasExpiry = cartItems.length > 0 && cartExpiryRemainingMs !== null;
  const expiryLabel = formatCartExpiry(cartExpiryRemainingMs);
  const syncLabel = cartSyncStatus === 'saving'
    ? 'Saving…'
    : cartSyncStatus === 'loading'
      ? 'Loading account basket…'
      : cartSyncStatus === 'saved'
        ? 'Saved to account'
        : 'Saved on this device';
  const showExpiryNote = hasExpiry && cartExpiryTone !== 'ok';
  const basketLoading = !cartReady;
  const syncFailed = Boolean(customer?.id) && cartSyncStatus === 'error';

  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [showCourierPicker, setShowCourierPicker] = useState(false);
  const [courierChoice, setCourierChoice] = useState(null);
  const [customerNotes, setCustomerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState(null);
  const itemsRef = useRef(null);
  const initialScrollTopRef = useRef(initialScrollTop);
  const initialRevealItemRequestRef = useRef(revealItemRequest);
  const onScrollPositionChangeRef = useRef(onScrollPositionChange);
  const courierDialogRef = useRef(null);
  const courierPreviousFocusRef = useRef(null);
  const courierDialogTitleId = useId();

  const inclVatEstimate = cartTotal;
  const discountAmount = appliedPromo?.discountAmount || 0;
  const estimatedTotal = Math.max(0, inclVatEstimate - discountAmount);

  useEffect(() => {
    setAppliedPromo(null);
  }, [cartTotal]);

  useEffect(() => {
    const el = itemsRef.current;
    if (!el) return undefined;
    const reportScrollPosition = onScrollPositionChangeRef.current;
    if (!initialRevealItemRequestRef.current) el.scrollTop = initialScrollTopRef.current;
    return () => reportScrollPosition?.(el.scrollTop);
  }, []);

  useEffect(() => {
    if (!revealItemRequest) return undefined;
    const { productId, token } = revealItemRequest;
    let highlightTimer;
    const revealFrame = window.requestAnimationFrame(() => {
      const line = itemsRef.current?.querySelector(`[data-cart-product-id="${productId}"]`);
      if (!line) return;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      line.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      setHighlightedItemId(productId);
      highlightTimer = window.setTimeout(() => {
        setHighlightedItemId(null);
        onRevealItemHandled?.(token);
      }, 1200);
    });
    return () => {
      window.cancelAnimationFrame(revealFrame);
      window.clearTimeout(highlightTimer);
    };
  }, [revealItemRequest, onRevealItemHandled]);

  const handleSubmitClick = () => {
    setShowCheckoutModal(true);
  };

  const handleCheckoutContinue = () => {
    setShowCheckoutModal(false);
    setShowCourierPicker(true);
    setCourierChoice(null);
    setCustomerNotes('');
  };

  const handleContinueShopping = () => {
    setShowCheckoutModal(false);
    onContinueShopping?.();
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

  useEffect(() => {
    if (!showCourierPicker) return undefined;
    courierPreviousFocusRef.current = document.activeElement;
    const dialog = courierDialogRef.current;
    const focusableSelector = [
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const getFocusable = () => Array.from(dialog?.querySelectorAll(focusableSelector) || [])
      .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');

    // CheckoutModal restores focus during its own cleanup. Defer this focus
    // until that cleanup has finished so the newly opened delivery dialog wins.
    const focusFrame = window.requestAnimationFrame(() => {
      getFocusable()[0]?.focus();
    });

    const onGlobalKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowCourierPicker(false);
        setCourierChoice(null);
        setCustomerNotes('');
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture phase so this runs before other document Escape handlers (e.g. the
    // mobile cart) — Escape should close only the delivery modal, not the cart.
    document.addEventListener('keydown', onGlobalKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.removeEventListener('keydown', onGlobalKeyDown, true);
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
      courierPreviousFocusRef.current?.focus?.();
    };
  }, [showCourierPicker]);

  return (
    <div className="order-drawer" style={{ position: 'relative' }}>
      <div className="drawer-header">
        <div className="drawer-title-group">
          <h2>My Order</h2>
          {cartItems.length > 0 && (
            <span className="drawer-item-count">
              {cartItems.length} {cartItems.length === 1 ? 'product' : 'products'}
            </span>
          )}
        </div>
        <div className="drawer-header-actions">
          {isReady && <span className="ready-pill">Ready</span>}
          {hasExpiry && (
            <span className={`cart-expiry-pill cart-expiry-pill--${cartExpiryTone}`}>
              {syncLabel} · {expiryLabel}
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              type="button"
              className="drawer-close-button"
              aria-label="Close cart"
              data-cart-close
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {showAutoCloseBar && (
        <div className={`drawer-auto-close drawer-auto-close--${cartExpiryTone}`} aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(100, autoCloseProgress))}%` }} />
        </div>
      )}

      {syncFailed && (
        <div className="cart-sync-alert" role="alert">
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>Basket sync needs attention</strong>
            <span>We cannot confirm this basket on your account. Retry before switching devices.</span>
          </div>
          <button type="button" onClick={onRetryCartSync}>Retry sync</button>
        </div>
      )}

      <div className="drawer-items" ref={itemsRef}>
        {cartItems.length === 0 && (
          <div className="drawer-empty">
            <div className="drawer-empty-icon"><ShoppingCart size={22} /></div>
            <strong>Your basket is empty</strong>
            <span>Browse the catalogue and add wholesale lines to build your order request.</span>
          </div>
        )}
        {cartItems.map((item) => (
          <div
            className={`drawer-line${highlightedItemId === item.product.id ? ' drawer-line--just-added' : ''}`}
            data-cart-product-id={item.product.id}
            key={item.product.id}
          >
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
                    disabled={basketLoading}
                    aria-label={`Decrease quantity for ${item.product.name}`}
                  >
                    -
                  </button>
                  <QuantityInput key={`${item.product.id}-${item.qty}`} item={item} updateQty={updateQty} disabled={basketLoading} />
                  <button
                    onClick={() => updateQty(item.product.id, item.qty + 1)}
                    type="button"
                    disabled={basketLoading}
                    aria-label={`Increase quantity for ${item.product.name}`}
                  >
                    +
                  </button>
                </div>
                <button className="remove-button" onClick={() => removeFromCart(item.product.id)} type="button" disabled={basketLoading} aria-label={`Remove ${item.product.name} from cart`}>
                  <Trash2 size={14} />
                </button>
              </div>
              {(() => {
                const adv = stockAdvisoryForQty(item.product, item.qty);
                return adv.isOverOrder ? (
                  <p className="drawer-line-stock-note">{adv.availableStock} in stock &middot; {adv.shortfall} to confirm</p>
                ) : null;
              })()}
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
        {basketLoading ? (
          <button className="primary-order-button" type="button" disabled>
            <Loader2 size={17} className="spin" />
            Loading account basket…
          </button>
        ) : isReady ? (
          <button className="primary-order-button" onClick={handleSubmitClick} type="button">
            <ShoppingCart size={17} />
            Review order request
          </button>
        ) : (
          <button className="continue-shopping-button" type="button" onClick={handleContinueShopping}>
            <ArrowLeft size={15} />
            Continue shopping — R{remaining.toFixed(2)} remaining
          </button>
        )}
        <button className="clear-button" onClick={() => { if (clearCart) clearCart(); else cartItems.forEach((item) => removeFromCart(item.product.id)); }} type="button" disabled={basketLoading}>
          <Trash2 size={13} />
          Clear order
        </button>
        <div className="drawer-trust">
          <PackageCheck size={14} />
          No payment now. We send a pro-forma after confirming your request.
        </div>
        <ol className="quote-steps">
          <li>Add trade products</li>
          <li>Reach the minimum</li>
          <li>Review and send your request</li>
        </ol>
      </div>

      <CheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        cartItems={cartItems}
        cartSubtotal={cartTotal}
        customer={customer}
        appliedPromo={appliedPromo}
        onPromoApplied={setAppliedPromo}
        onPromoClear={() => setAppliedPromo(null)}
        onKeepShopping={handleContinueShopping}
        onContinue={handleCheckoutContinue}
      />

      {showCourierPicker && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={courierDialogTitleId}
          onClick={closeCourierPicker}
          className="courier-modal-backdrop"
        >
          <div
            ref={courierDialogRef}
            onClick={(e) => e.stopPropagation()}
            className="courier-modal-sheet"
            tabIndex={-1}
          >
            <div id={courierDialogTitleId} style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 17, color: '#0f172a', marginBottom: 6 }}>Choose delivery for your order request</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Select how you would like to receive the order. Proto will confirm the final delivery details and cost.</div>
            <div className="courier-options">
              {[
                { key: 'own', Icon: Truck, title: "I'll use my own courier", desc: 'You arrange collection or delivery.' },
                { key: 'proto', Icon: Package, title: 'Proto Trading delivers', desc: 'We will arrange delivery and include the cost in your quote.' },
                { key: 'pickup', Icon: Store, title: 'Pick up in store', desc: 'Collect your order from Proto — no delivery.' },
              ].map(({ key, Icon, title, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCourierChoice(key)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', border: `2px solid ${courierChoice === key ? '#0f172a' : '#e2e8f0'}`, borderRadius: 12, background: courierChoice === key ? '#f8fafc' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s' }}
                >
                  <Icon size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{desc}</div>
                  </div>
                  {courierChoice === key && <Check size={18} aria-hidden="true" style={{ marginLeft: 'auto', color: '#0f172a', flexShrink: 0 }} />}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 8 }}>
                PO/reference or delivery notes (optional)
              </span>
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="For example: PO 1234, delivery timing or collection instructions…"
                rows={3}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', color: '#0f172a', background: '#fff', boxSizing: 'border-box' }}
              />
            </label>

            <div className="checkout-payment-notice" role="note" aria-label="Payment instruction">
              <ShieldAlert size={19} aria-hidden />
              <div>
                <strong>This is an order request — not an invoice.</strong>
                <span>Please do not make payment yet. We will confirm stock, final pricing and delivery, then email your pro-forma invoice with payment instructions.</span>
              </div>
            </div>

            <div className="courier-modal-actions">
              <button
                type="button"
                onClick={handleConfirmCourier}
                disabled={!courierChoice || submitting}
                className="courier-submit-button"
              >
                {submitting && <Loader2 size={17} className="spin-icon" aria-hidden />}
                {submitting ? 'Sending your order request…' : 'Send order request — no payment now'}
              </button>
              <button type="button" onClick={closeCourierPicker} className="courier-cancel-button">
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

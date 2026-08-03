import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2, Loader2, Mail, MapPin, MessageCircle, PackageCheck, Tag, User, X,
} from 'lucide-react';
import { updateWhatsappOptIn } from '../lib/auth';
import { getDeliveryAddressReview } from '../lib/checkoutReview';
import { validatePromoCode } from '../lib/promoCode';
import { isWhatsappConsentUnset } from '../lib/whatsappConsent';
import { sellingUnitDetails } from '../../lib/selling-unit.mjs';
import { groupCartItemsByFulfilment } from '../../lib/cart-fulfilment.mjs';

function CheckoutLine({ item, toOrder = false }) {
  return (
    <div className={`checkout-review-line${toOrder ? ' checkout-review-line--to-order' : ''}`}>
      <div>
        <div className="checkout-review-line-title">
          <strong>{item.product.name}</strong>
          {toOrder && <em className="checkout-to-order-badge">To order</em>}
        </div>
        <span>{item.product.code} · Qty {item.qty} × {sellingUnitDetails(item.product.unitsOfIssue).label}</span>
        {Number(item.product.minQty) > 1
          ? <span>Minimum order: {item.product.minQty} × {sellingUnitDetails(item.product.unitsOfIssue).label}</span>
          : null}
        {toOrder && <span className="checkout-to-order-guidance">Made or sourced on request · lead time confirmed before invoicing</span>}
      </div>
      <b>R{(item.product.price * item.qty).toFixed(2)}</b>
    </div>
  );
}

function ReviewField({
  icon: Icon, label, value, describedBy,
}) {
  return (
    <div className="checkout-review-field" aria-describedby={describedBy}>
      <Icon size={15} aria-hidden />
      <div>
        <span>{label}</span>
        <strong>{value || 'To confirm with Proto'}</strong>
      </div>
    </div>
  );
}

export default function CheckoutModal({
  isOpen,
  onClose,
  cartItems = [],
  cartSubtotal,
  customer,
  appliedPromo,
  onPromoApplied,
  onPromoClear,
  onKeepShopping,
  onContinue,
  onEditDeliveryAddress,
}) {
  const [step, setStep] = useState('review');
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [whatsappChoice, setWhatsappChoice] = useState(null);
  const [continuing, setContinuing] = useState(false);
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Ask only when no preference has ever been recorded. A deliberate "No"
  // remains a valid choice and must not interrupt every future checkout.
  const showWhatsapp = Boolean(customer) && isWhatsappConsentUnset(customer.accept_whatsapp);
  const addressReview = getDeliveryAddressReview(customer);
  const groupedItems = groupCartItemsByFulfilment(cartItems);

  // Reset the modal to its first step only when it OPENS. Depending on
  // appliedPromo?.code here was a bug: applying a valid code changed that value,
  // re-ran this effect, and bounced the user back to the "add-more" step — so the
  // discount confirmation vanished and it looked like nothing happened.
  useEffect(() => {
    if (!isOpen) return;
    setStep('review');
    setPromoInput(appliedPromo?.code || '');
    setPromoError('');
    setWhatsappChoice(null);
    setContinuing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    returnFocusRef.current = document.activeElement;
    window.requestAnimationFrame(() => dialogRef.current?.querySelector('.checkout-modal-close')?.focus());
    return () => {
      const returnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => returnTarget?.focus());
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyPromo = async () => {
    const trimmed = promoInput.trim();
    if (!trimmed) {
      onPromoClear?.();
      setPromoError('');
      return;
    }
    setPromoLoading(true);
    setPromoError('');
    try {
      const result = await validatePromoCode(trimmed, cartSubtotal);
      if (!result.valid) {
        setPromoError(result.error || 'Invalid promo code.');
        onPromoClear?.();
        return;
      }
      onPromoApplied?.({
        code: result.code,
        discountPct: result.discountPct,
        discountAmount: result.discountAmount,
        total: result.total,
      });
    } catch (err) {
      setPromoError(err.message || 'Could not verify promo code.');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleContinue = async () => {
    if (showWhatsapp && whatsappChoice === null) return;
    setContinuing(true);
    try {
      if (showWhatsapp && whatsappChoice !== null) {
        try {
          await updateWhatsappOptIn(whatsappChoice === true);
        } catch (err) {
          console.warn('WhatsApp opt-in update failed:', err.message);
        }
      }
      onContinue?.();
    } finally {
      setContinuing(false);
    }
  };

  return createPortal(
    <div className="checkout-modal-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="checkout-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title">
        <button type="button" className="checkout-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {step === 'review' ? (
          <>
            <h2 id="checkout-modal-title" className="checkout-modal-title">Review your order request</h2>
            <p className="checkout-modal-sub">
              Check your account, delivery address and quantities before continuing. Nothing is submitted from this screen.
            </p>

            <div className="checkout-review-account" aria-label="Customer details">
              <ReviewField icon={Building2} label="Company" value={customer?.business_name} />
              {customer?.customer_code && (
                <ReviewField icon={Building2} label="Account number" value={customer.customer_code} />
              )}
              <ReviewField icon={User} label="Contact" value={customer?.contact_name || customer?.name} />
              <ReviewField icon={Mail} label="Email" value={customer?.email} />
              <ReviewField
                icon={MapPin}
                label="Delivery address"
                value={addressReview.value}
                describedBy={!addressReview.complete ? 'checkout-address-warning' : undefined}
              />
            </div>
            {!addressReview.complete && (
              <div
                id="checkout-address-warning"
                className="checkout-address-warning"
                role="status"
                aria-live="polite"
              >
                <MapPin size={17} aria-hidden />
                <div>
                  <strong>Check your delivery address</strong>
                  <span>{addressReview.warning}</span>
                  {onEditDeliveryAddress && (
                    <button
                      type="button"
                      className="checkout-address-edit"
                      onClick={() => {
                        onClose?.();
                        onEditDeliveryAddress();
                      }}
                    >
                      Edit delivery address
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="checkout-review-heading">
              <strong>Products</strong>
              <span>{cartItems.length} line{cartItems.length === 1 ? '' : 's'}</span>
            </div>
            <div className="checkout-review-lines">
              {groupedItems.available.length > 0 && (
                <section className="checkout-review-group" aria-labelledby="checkout-available-heading">
                  <div className="checkout-review-group-heading" id="checkout-available-heading">
                    <strong>Available products</strong>
                    <span>{groupedItems.available.length} line{groupedItems.available.length === 1 ? '' : 's'}</span>
                  </div>
                  {groupedItems.available.map((item) => (
                    <CheckoutLine item={item} key={item.product.id} />
                  ))}
                </section>
              )}
              {groupedItems.toOrder.length > 0 && (
                <section className="checkout-review-group checkout-review-group--to-order" aria-labelledby="checkout-to-order-heading">
                  <div className="checkout-review-group-heading checkout-review-group-heading--to-order" id="checkout-to-order-heading">
                    <div>
                      <strong>To order</strong>
                      <small>Not currently in stock</small>
                    </div>
                    <span>{groupedItems.toOrder.length} line{groupedItems.toOrder.length === 1 ? '' : 's'}</span>
                  </div>
                  {groupedItems.toOrder.map((item) => (
                    <CheckoutLine item={item} toOrder key={item.product.id} />
                  ))}
                  <p className="checkout-to-order-note">
                    We’ll confirm the expected lead time before invoicing. No payment is taken now.
                  </p>
                </section>
              )}
            </div>
            <div className="checkout-review-total">
              <span>Subtotal incl. VAT</span>
              <strong>R{cartSubtotal.toFixed(2)}</strong>
            </div>

            <div className="checkout-review-next" role="note">
              <PackageCheck size={18} aria-hidden />
              <div>
                <strong>What happens next</strong>
                <span>Choose delivery, add an optional PO/reference, then send the request. Proto confirms stock, final pricing and delivery before emailing your pro-forma invoice. No payment is taken now.</span>
              </div>
            </div>

            <div className="checkout-modal-actions">
              <button type="button" className="checkout-modal-btn checkout-modal-btn--primary" onClick={() => setStep('details')}>
                Continue to options
              </button>
              <button type="button" className="checkout-modal-btn checkout-modal-btn--secondary" onClick={onKeepShopping}>
                Keep shopping
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="checkout-modal-title" className="checkout-modal-title">Order request options</h2>
            <p className="checkout-modal-sub">
              Add a promo code if you have one. On the next screen, choose delivery and add any PO/reference. No payment is taken now.
            </p>

            <div className="checkout-modal-section">
              <label className="checkout-modal-label" htmlFor="checkout-promo-code">
                <Tag size={14} />
                Promo code (optional)
              </label>
              <div className="checkout-modal-promo-row">
                <input
                  id="checkout-promo-code"
                  type="text"
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value); setPromoError(''); }}
                  placeholder="Enter code"
                  className="checkout-modal-input"
                  autoCapitalize="characters"
                  aria-invalid={Boolean(promoError)}
                  aria-describedby={promoError ? 'checkout-promo-error' : undefined}
                />
                <button
                  type="button"
                  className="checkout-modal-btn checkout-modal-btn--apply"
                  onClick={handleApplyPromo}
                  disabled={promoLoading}
                >
                  {promoLoading ? <Loader2 size={16} className="spin-icon" /> : 'Apply'}
                </button>
              </div>
              {promoError && (
                <p id="checkout-promo-error" className="checkout-modal-error" role="alert">
                  {promoError}
                </p>
              )}
              {appliedPromo && !promoError && (
                <div className="checkout-modal-promo-applied" role="status" aria-live="polite">
                  <p className="checkout-modal-success">
                    ✓ {appliedPromo.code} applied — {appliedPromo.discountPct}% off, you save R{appliedPromo.discountAmount.toFixed(2)}
                  </p>
                  {typeof appliedPromo.total === 'number' && (
                    <p className="checkout-modal-promo-total">
                      Estimated total: <strong>R{appliedPromo.total.toFixed(2)}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>

            {showWhatsapp && (
              <div className="checkout-modal-section checkout-modal-whatsapp">
                <div id="checkout-whatsapp-label" className="checkout-modal-label">
                  <MessageCircle size={14} />
                  Get stock updates and specials on WhatsApp?
                </div>
                <div className="checkout-modal-whatsapp-actions" role="group" aria-labelledby="checkout-whatsapp-label">
                  <button
                    type="button"
                    className={`checkout-modal-btn checkout-modal-btn--wa${whatsappChoice === true ? ' selected' : ''}`}
                    onClick={() => setWhatsappChoice(true)}
                    aria-pressed={whatsappChoice === true}
                  >
                    Yes, join
                  </button>
                  <button
                    type="button"
                    className={`checkout-modal-btn checkout-modal-btn--secondary${whatsappChoice === false ? ' selected' : ''}`}
                    onClick={() => setWhatsappChoice(false)}
                    aria-pressed={whatsappChoice === false}
                  >
                    No thanks
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              className="checkout-modal-btn checkout-modal-btn--primary checkout-modal-btn--full"
              onClick={handleContinue}
              disabled={continuing || (showWhatsapp && whatsappChoice === null)}
            >
              {continuing ? 'Continuing…' : 'Continue to delivery'}
            </button>
            <button type="button" className="checkout-modal-back-link" onClick={() => setStep('review')}>
              Back to review
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

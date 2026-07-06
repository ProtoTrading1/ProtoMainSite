import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageCircle, Tag, X } from 'lucide-react';
import { updateWhatsappOptIn } from '../lib/auth';
import { validatePromoCode } from '../lib/promoCode';

export default function CheckoutModal({
  isOpen,
  onClose,
  cartSubtotal,
  customer,
  appliedPromo,
  onPromoApplied,
  onPromoClear,
  onKeepShopping,
  onContinue,
}) {
  const [step, setStep] = useState('add-more');
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [whatsappChoice, setWhatsappChoice] = useState(null);
  const [continuing, setContinuing] = useState(false);

  const showWhatsapp = customer && customer.accept_whatsapp !== true;

  useEffect(() => {
    if (!isOpen) return;
    setStep('add-more');
    setPromoInput(appliedPromo?.code || '');
    setPromoError('');
    setWhatsappChoice(null);
    setContinuing(false);
  }, [isOpen, appliedPromo?.code]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

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
      <div className="checkout-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title">
        <button type="button" className="checkout-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {step === 'add-more' ? (
          <>
            <h2 id="checkout-modal-title" className="checkout-modal-title">Ready to submit your order?</h2>
            <p className="checkout-modal-sub">
              Would you like to add more items before we send your quote request?
            </p>
            <div className="checkout-modal-actions">
              <button type="button" className="checkout-modal-btn checkout-modal-btn--secondary" onClick={onKeepShopping}>
                Yes, keep shopping
              </button>
              <button type="button" className="checkout-modal-btn checkout-modal-btn--primary" onClick={() => setStep('details')}>
                No, continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="checkout-modal-title" className="checkout-modal-title">Before we send your quote</h2>
            <p className="checkout-modal-sub">
              Optional promo code and updates. Discounts are estimated on your request — final pricing is confirmed by reply.
            </p>

            <div className="checkout-modal-section">
              <label className="checkout-modal-label">
                <Tag size={14} />
                Promo code (optional)
              </label>
              <div className="checkout-modal-promo-row">
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value); setPromoError(''); }}
                  placeholder="Enter code"
                  className="checkout-modal-input"
                  autoCapitalize="characters"
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
              {promoError && <p className="checkout-modal-error">{promoError}</p>}
              {appliedPromo && !promoError && (
                <p className="checkout-modal-success">
                  {appliedPromo.discountPct}% discount applied — saves R{appliedPromo.discountAmount.toFixed(2)}
                </p>
              )}
            </div>

            {showWhatsapp && (
              <div className="checkout-modal-section checkout-modal-whatsapp">
                <div className="checkout-modal-label">
                  <MessageCircle size={14} />
                  Get stock updates and specials on WhatsApp?
                </div>
                <div className="checkout-modal-whatsapp-actions">
                  <button
                    type="button"
                    className={`checkout-modal-btn checkout-modal-btn--wa${whatsappChoice === true ? ' selected' : ''}`}
                    onClick={() => setWhatsappChoice(true)}
                  >
                    Yes, join
                  </button>
                  <button
                    type="button"
                    className={`checkout-modal-btn checkout-modal-btn--secondary${whatsappChoice === false ? ' selected' : ''}`}
                    onClick={() => setWhatsappChoice(false)}
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
            <button type="button" className="checkout-modal-back-link" onClick={() => setStep('add-more')}>
              Back
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

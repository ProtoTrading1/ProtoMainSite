import { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, X } from 'lucide-react';

export default function OrderConfirmModal({
  isOpen,
  onClose,
  orderStatus = 'idle',
  orderError = '',
  orderChanges = [],
  orderNumber = '',
  orderRecoveryNote = '',
  pendingRequestSummary = null,
  currentBasketSummary = null,
  cleanupWarning = false,
  onRetryCleanup,
  onReviewCurrentBasket,
  onCheckSavedRequest,
  onReview,
  onViewOrder,
}) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const isChecking = orderStatus === 'checking';
  const isSending = orderStatus === 'sending' || isChecking;
  const isRecovered = orderStatus === 'received';
  const isSuccess = orderStatus === 'sent' || orderStatus === 'saved' || isRecovered;
  const isError = orderStatus === 'error';
  const requiresReview = isError && orderChanges.length > 0;
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    returnFocusRef.current = document.activeElement;
    window.requestAnimationFrame(() => {
      const target = isSending
        ? dialogRef.current
        : dialogRef.current?.querySelector('.ocm-close');
      target?.focus();
      if (dialogRef.current) dialogRef.current.scrollTop = 0;
    });
    const handler = (event) => {
      if (event.key === 'Escape') {
        if (isSending) return;
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      const returnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => returnTarget?.focus());
    };
  }, [isOpen, isSending]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={isSending ? undefined : onClose}>
      <section
        ref={dialogRef}
        className="order-modal-v2 order-modal-v2--simple"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-confirm-title"
        tabIndex={-1}
      >
        <button className="ocm-close" onClick={onClose} type="button" aria-label="Close" disabled={isSending}><X size={18} /></button>

        <div className={`ocm-header ${isSuccess ? 'ocm-header--sent' : isError ? 'ocm-header--error' : 'ocm-header--sending'}`}>
          <div className="ocm-header-icon">
            {isSending && <Loader2 size={26} className="spin-icon" />}
            {isSuccess && <CheckCircle2 size={26} />}
            {isError && <AlertCircle size={26} />}
          </div>
          <div>
            {isSuccess && (
              <>
                <h2 id="order-confirm-title" className="ocm-title">{isRecovered ? 'Saved request received' : 'Order request received. Thank you.'}</h2>
                <p className="ocm-subtitle">
                  {orderNumber ? `${orderNumber} · ` : ''}
                  Proto Trading will confirm stock, final pricing and delivery.
                </p>
              </>
            )}
            {isSending && (
              <>
                <h2 id="order-confirm-title" className="ocm-title">{isChecking ? 'Checking saved request' : 'Sending your order.'}</h2>
                <p className="ocm-subtitle" role="status">{isChecking ? 'Checking the earlier request. Your current basket is kept.' : 'Please wait a moment.'}</p>
              </>
            )}
            {isError && (
              <>
                <h2 id="order-confirm-title" className="ocm-title">{pendingRequestSummary && !requiresReview ? 'Saved request needs confirmation' : requiresReview ? 'Your basket needs review' : 'Could not send order'}</h2>
                <p className="ocm-subtitle">
                  {orderError || 'Something went wrong. Please try again.'}
                </p>
              </>
            )}
          </div>
        </div>

        {pendingRequestSummary && currentBasketSummary && (
          <section className="ocm-request-summary" aria-label="Saved request and current basket">
            <dl>
              <div><dt>Saved request</dt><dd>{pendingRequestSummary.lineCount} product lines · R{pendingRequestSummary.total.toFixed(2)}</dd></div>
              <div><dt>Current basket</dt><dd>{currentBasketSummary.lineCount} product lines · R{currentBasketSummary.total.toFixed(2)}</dd></div>
            </dl>
            <p>Items totals include VAT, before any promotion.</p>
            {pendingRequestSummary.fingerprint !== currentBasketSummary.fingerprint && <p className="ocm-request-difference">These contain different items or quantities. Checking the saved request does not submit your current basket.</p>}
            <p>Saved request reference: <span className="ocm-request-reference">{pendingRequestSummary.clientRef}</span></p>
          </section>
        )}

        {isSuccess && (
          <div className="ocm-payment-notice" role="note" aria-label="Payment instruction">
            <ShieldAlert size={19} aria-hidden />
            <div>
              <strong>No payment is required yet.</strong>
              <span>We will email your official pro-forma invoice before you make payment.</span>
            </div>
          </div>
        )}

        {isSuccess && orderRecoveryNote && (
          <p className="ocm-subtitle" role="status">{orderRecoveryNote}</p>
        )}

        {requiresReview && (
          <div className="ocm-change-list" role="alert" aria-live="assertive">
            {orderChanges.map((change) => (
              <div className="ocm-change-line" key={change.sku}>
                <strong>{change.name}</strong>
                {change.priceChanged && (
                  <span>
                    Price: {change.previousPrice === null ? 'not verified' : `R${change.previousPrice.toFixed(2)}`}
                    {' → '}{change.currentPrice === null ? 'unavailable' : `R${change.currentPrice.toFixed(2)}`}
                  </span>
                )}
                {!change.toOrder && (change.stockChanged || change.quantityExceedsStock || change.stockUnavailable) && (
                  <span>
                    Stock: {change.currentStockQty === null ? 'currently unavailable' : `${change.currentStockQty} available`}
                    {change.quantityExceedsStock ? ` · your quantity is ${change.requestedQty}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {isSuccess && cleanupWarning && (
          <div className="ocm-payment-notice" role="alert">
            <ShieldAlert size={19} aria-hidden />
            <div>
              <strong>{orderNumber ? `Order ${orderNumber} was received. Do not resubmit it.` : 'Your order was received. Do not resubmit it.'}</strong>
              <span>Basket cleanup could not be confirmed. Keep this page open and retry basket cleanup before leaving or signing out. If the old basket returns, contact Proto with this order reference.</span>
              <button className="ocm-copy-btn" type="button" onClick={onRetryCleanup}>Retry basket cleanup</button>
            </div>
          </div>
        )}

        {isSuccess && orderRecoveryNote && onReviewCurrentBasket && (
          <button className="ocm-copy-btn" type="button" onClick={onReviewCurrentBasket}>
            Review current basket
          </button>
        )}

        {(isSuccess || isError) && (
          <div className="ocm-actions ocm-actions--simple">
            {(isSuccess || isError) && onViewOrder && (
              <button className="ocm-copy-btn ocm-done-btn" onClick={onViewOrder} type="button">
                {isSuccess ? 'View order' : 'Check My Orders'}
              </button>
            )}
            {isError && onCheckSavedRequest && <button className="ocm-copy-btn ocm-done-btn" onClick={onCheckSavedRequest} type="button">Check saved request</button>}
            {isError && requiresReview && <button className="ocm-copy-btn" onClick={onReview} type="button">Review current basket</button>}
            <button className="ocm-copy-btn" onClick={onClose} type="button">Close</button>
          </div>
        )}
      </section>
    </div>
  );
}

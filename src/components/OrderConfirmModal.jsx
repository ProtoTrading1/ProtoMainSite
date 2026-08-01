import { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, X } from 'lucide-react';

export default function OrderConfirmModal({
  isOpen,
  onClose,
  orderStatus = 'idle',
  orderError = '',
  orderNumber = '',
  onRetry,
  onViewOrder,
}) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const isSending = orderStatus === 'sending';
  const isSuccess = orderStatus === 'sent' || orderStatus === 'saved';
  const isError = orderStatus === 'error';
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
                <h2 id="order-confirm-title" className="ocm-title">Order request received. Thank you.</h2>
                <p className="ocm-subtitle">
                  {orderNumber ? `${orderNumber} · ` : ''}
                  Proto Trading will confirm stock, final pricing and delivery.
                </p>
              </>
            )}
            {isSending && (
              <>
                <h2 id="order-confirm-title" className="ocm-title">Sending your order…</h2>
                <p className="ocm-subtitle">Please wait a moment.</p>
              </>
            )}
            {isError && (
              <>
                <h2 id="order-confirm-title" className="ocm-title">Could not send order</h2>
                <p className="ocm-subtitle">{orderError || 'Something went wrong. Please try again.'}</p>
              </>
            )}
          </div>
        </div>

        {isSuccess && (
          <div className="ocm-payment-notice" role="note" aria-label="Payment instruction">
            <ShieldAlert size={19} aria-hidden />
            <div>
              <strong>No payment is required yet.</strong>
              <span>We will email your official pro-forma invoice before you make payment.</span>
            </div>
          </div>
        )}

        {(isSuccess || isError) && (
          <div className="ocm-actions ocm-actions--simple">
            {isSuccess && onViewOrder && (
              <button className="ocm-copy-btn ocm-done-btn" onClick={onViewOrder} type="button">
                View order
              </button>
            )}
            <button
              className={`ocm-copy-btn ${isError ? 'ocm-done-btn' : ''}`}
              onClick={isError ? onRetry : onClose}
              type="button"
            >
              {isSuccess ? 'Close' : 'Try again'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

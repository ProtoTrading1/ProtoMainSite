import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

export default function OrderConfirmModal({
  isOpen,
  onClose,
  orderStatus = 'idle',
  orderError = '',
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSending = orderStatus === 'sending';
  const isSuccess = orderStatus === 'sent' || orderStatus === 'saved';
  const isError = orderStatus === 'error';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="order-modal-v2 order-modal-v2--simple" onClick={(e) => e.stopPropagation()}>
        <button className="ocm-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>

        <div className={`ocm-header ${isSuccess ? 'ocm-header--sent' : isError ? 'ocm-header--error' : 'ocm-header--sending'}`}>
          <div className="ocm-header-icon">
            {isSending && <Loader2 size={26} className="spin-icon" />}
            {isSuccess && <CheckCircle2 size={26} />}
            {isError && <AlertCircle size={26} />}
          </div>
          <div>
            {isSuccess && (
              <>
                <h2 className="ocm-title">Order confirmed. Thank you.</h2>
                <p className="ocm-subtitle">Proto Trading has received your order and will be in touch.</p>
              </>
            )}
            {isSending && (
              <>
                <h2 className="ocm-title">Sending your order…</h2>
                <p className="ocm-subtitle">Please wait a moment.</p>
              </>
            )}
            {isError && (
              <>
                <h2 className="ocm-title">Could not send order</h2>
                <p className="ocm-subtitle">{orderError || 'Something went wrong. Please try again.'}</p>
              </>
            )}
          </div>
        </div>

        {(isSuccess || isError) && (
          <div className="ocm-actions ocm-actions--simple">
            <button className="ocm-copy-btn ocm-done-btn" onClick={onClose} type="button">
              {isSuccess ? 'Close' : 'Try again'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

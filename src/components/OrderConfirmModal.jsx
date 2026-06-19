import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Loader2, AlertCircle, X } from 'lucide-react';

export default function OrderConfirmModal({
  isOpen,
  onClose,
  cartItems,
  cartTotal,
  orderText,
  orderStatus = 'idle',
  orderError = '',
  customerDetails,
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setCopied(false);
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyOrder = async () => {
    await navigator.clipboard.writeText(orderText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isSending = orderStatus === 'sending';
  const isSent = orderStatus === 'sent';
  const isSaved = orderStatus === 'saved';
  const isError = orderStatus === 'error';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="order-modal-v2" onClick={(e) => e.stopPropagation()}>

        {/* Close */}
        <button className="ocm-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>

        {/* Status header */}
        <div className={`ocm-header ${(isSent || isSaved) ? 'ocm-header--sent' : isError ? 'ocm-header--error' : 'ocm-header--sending'}`}>
          <div className="ocm-header-icon">
            {isSending && <Loader2 size={26} className="spin-icon" />}
            {(isSent || isSaved) && <CheckCircle2 size={26} />}
            {isError && <AlertCircle size={26} />}
          </div>
          <div>
            <p className="ocm-eyebrow">Order Request</p>
            <h2 className="ocm-title">
              {isSent ? 'Order sent!' : isSaved ? 'Order received!' : isSending ? 'Sending your order…' : isError ? 'Could not send order' : 'Processing order'}
            </h2>
            <p className="ocm-subtitle">
              {isSent && 'The Proto Trading team will confirm stock and pricing by reply.'}
              {isSaved && 'Your order is saved and our team will be in touch. Email notification was delayed — but your request is confirmed.'}
              {isSending && 'Generating the PDF and emailing the Proto Trading team.'}
              {isError && orderError}
              {!isSent && !isSaved && !isSending && !isError && 'Processing your order request.'}
            </p>
          </div>
        </div>

        {/* Order lines */}
        <div className="ocm-lines">
          {cartItems.map((item) => (
            <div key={item.product.id} className="ocm-line">
              <div className="ocm-line-code">{item.product.code}</div>
              <div className="ocm-line-name">{item.product.name}</div>
              <div className="ocm-line-qty">{item.qty} × R{item.product.price.toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Subtotal */}
        <div className="ocm-total">
          <span>Subtotal incl. VAT</span>
          <strong>R{cartTotal.toFixed(2)}</strong>
        </div>

        {/* Buyer profile */}
        {customerDetails && (
          <div className="ocm-buyer">
            <p className="ocm-buyer-label">Buyer Profile</p>
            <p className="ocm-buyer-name">{customerDetails.name}</p>
            <p className="ocm-buyer-detail">{customerDetails.email} · {customerDetails.phone} · {customerDetails.region}</p>
          </div>
        )}

        {/* Actions */}
        <div className="ocm-actions">
          <div className={`ocm-status-pill ${isError ? 'ocm-status-pill--error' : (isSent || isSaved) ? 'ocm-status-pill--sent' : ''}`}>
            {isSending && <><Loader2 size={15} className="spin-icon" /> Sending…</>}
            {isSent && <><CheckCircle2 size={15} /> Sent to Proto Trading</>}
            {isSaved && <><CheckCircle2 size={15} /> Order confirmed</>}
            {isError && <><AlertCircle size={15} /> Send failed</>}
          </div>
          <button className="ocm-copy-btn" onClick={copyOrder} type="button">
            {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy request</>}
          </button>
        </div>

      </section>
    </div>
  );
}

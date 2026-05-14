import { useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle, Copy, Loader2, X } from 'lucide-react';

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
    const handler = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyOrder = async () => {
    await navigator.clipboard.writeText(orderText);
    setCopied(true);
  };

  const isSending = orderStatus === 'sending';
  const isSent = orderStatus === 'sent';
  const isError = orderStatus === 'error';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="order-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div className="success-icon"><CheckCircle size={25} /></div>
          <div>
            <span className="eyebrow">Quote request</span>
            <h2>{isSent ? 'Order request sent' : isSending ? 'Sending order request' : isError ? 'Order could not be sent' : 'Order request'}</h2>
            <p>
              {isSent && 'The order request PDF has been emailed to the Proto Trading team.'}
              {isSending && 'Generating the PDF and sending it to the Proto Trading team.'}
              {isError && orderError}
              {!isSent && !isSending && !isError && 'Review the summary while the request is processed.'}
            </p>
          </div>
          <button onClick={onClose} type="button" aria-label="Close"><X size={20} /></button>
        </header>

        <div className="modal-lines">
          {cartItems.map((item) => (
            <div key={item.product.id}>
              <span>{item.product.code}</span>
              <strong>{item.product.name}</strong>
              <b>{item.qty} x R{item.product.price.toFixed(2)}</b>
            </div>
          ))}
        </div>

        <div className="modal-total">
          <span>Subtotal excl. VAT</span>
          <strong>R{cartTotal.toFixed(2)}</strong>
        </div>

        {customerDetails && (
          <div className="modal-customer">
            <span>Buyer profile</span>
            <strong>{customerDetails.name}</strong>
            <p>{customerDetails.email} | {customerDetails.phone} | {customerDetails.region}</p>
          </div>
        )}

        <div className="modal-actions">
          <div className={`primary-order-button ${isError ? 'order-error-state' : ''}`}>
            {isSending && <Loader2 size={17} className="spin-icon" />}
            {isSent && <CheckCircle size={17} />}
            {isError && <AlertCircle size={17} />}
            {isSending ? 'Sending...' : isSent ? 'Sent to Proto Trading' : isError ? 'Send failed' : 'Processing'}
          </div>
          <button className="copy-button" onClick={copyOrder} type="button">
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? 'Copied' : 'Copy request'}
          </button>
        </div>
      </section>
    </div>
  );
}

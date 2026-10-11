import { useState } from 'react';
import { Check, MessageSquare, Send } from 'lucide-react';
import { submitProductFeedback } from '../lib/feedbackAnalytics';

const REASONS = [
  ['price', 'Price'],
  ['information', 'Need more information'],
  ['image', 'Image unclear'],
  ['stock', 'Out of stock'],
  ['minimum_quantity', 'Minimum quantity'],
  ['other', 'Something else'],
];

export default function ProductFeedbackPrompt({ product }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    const ok = await submitProductFeedback({ productId: product?.id, productCode: product?.code || product?.sku || product?.barcode, productLabel: product?.name, reason, detail: detail.trim() });
    if (ok) setSent(true);
    setSending(false);
  };

  if (sent) return <div className="pz-feedback-success"><Check size={14} /> Thanks — this helps us improve the product information.</div>;

  return (
    <div className="pz-feedback">
      <button type="button" className="pz-feedback-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <MessageSquare size={14} /> Something stopping you from ordering?
      </button>
      {open && (
        <div className="pz-feedback-panel">
          <p>Tell us what would help. This takes one click.</p>
          <div className="pz-feedback-options" role="group" aria-label="Product feedback reason">
            {REASONS.map(([value, label]) => <button key={value} type="button" className={reason === value ? 'is-selected' : ''} onClick={() => setReason(value)}>{label}</button>)}
          </div>
          {reason === 'other' && <textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="What should we know?" maxLength={300} rows={2} />}
          <button type="button" className="pz-feedback-submit" disabled={!reason || sending} onClick={() => void submit()}><Send size={13} /> {sending ? 'Sending…' : 'Send feedback'}</button>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { ArrowRight, FileText, ShoppingBag } from 'lucide-react';

export default function StickyBar({ cartItems, cartTotal, sendOrderEmail }) {
  const isReady = cartTotal >= 1000;
  const remaining = Math.max(0, 1000 - cartTotal);
  const itemCount = cartItems.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="sticky-order-bar">
      <span className="desktop-only">Logged-in trade portal | Prices shown excl. VAT</span>
      <strong>
        {isReady ? 'Minimum reached. Quote is ready.' : `Add R${remaining.toFixed(2)} more to submit.`}
      </strong>
      <div className="sticky-summary">
        <ShoppingBag size={19} />
        <span>{itemCount} units</span>
        <b>R{cartTotal.toFixed(2)}</b>
        <button onClick={sendOrderEmail} disabled={!isReady} type="button">
          <FileText size={15} />
          Send
          {isReady && <ArrowRight size={14} />}
        </button>
      </div>
    </div>
  );
}

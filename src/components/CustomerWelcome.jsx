import { ArrowRight, Building2, Package } from 'lucide-react';

function firstName(customer) {
  const fullName = String(customer?.contact_name || customer?.name || '').trim();
  return fullName.split(/\s+/)[0] || 'there';
}

export default function CustomerWelcome({ customer, hasLastOrder = false, onViewOrders }) {
  if (!customer?.id) return null;

  const company = String(customer.business_name || '').trim();

  return (
    <section className="customer-welcome" aria-labelledby="customer-welcome-title">
      <div className="customer-welcome-copy">
        <p className="customer-welcome-eyebrow">Your Proto trade account</p>
        <h1 id="customer-welcome-title">Welcome back, {firstName(customer)}</h1>
        {company && (
          <p className="customer-welcome-company">
            <Building2 size={14} aria-hidden="true" />
            {company}
          </p>
        )}
      </div>

      <button className="customer-welcome-orders" type="button" onClick={onViewOrders}>
        <span className="customer-welcome-orders-icon" aria-hidden="true">
          <Package size={18} />
        </span>
        <span className="customer-welcome-orders-copy">
          <strong>{hasLastOrder ? 'View recent orders' : 'Your orders'}</strong>
          <small>{hasLastOrder ? 'Review or reorder previous products' : 'Orders will appear here'}</small>
        </span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </section>
  );
}

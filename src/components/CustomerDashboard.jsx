import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Box, ChevronRight, Heart, ShieldCheck, ShoppingBag, ShoppingCart, Tag, Truck } from 'lucide-react';
import { fetchOrderHistory } from '../lib/orders';
import { customerOrderStatus, orderVatSummary } from '../lib/orderPresentation';

function firstName(customer) {
  return String(customer?.contact_name || customer?.name || '').trim().split(/\s+/)[0] || 'there';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function itemKey(item) {
  return item?.productId || item?.product_id || item?.code || item?.sku || item?.name;
}

export default function CustomerDashboard({ customer, products = [], addToCart, onViewOrders, onViewProfile, onContinueShopping }) {
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!customer?.id) return undefined;
    let active = true;
    fetchOrderHistory(customer.id, 10).then((rows) => { if (active) setOrders(Array.isArray(rows) ? rows : []); }).catch(() => {});
    return () => { active = false; };
  }, [customer?.id]);

  const latest = orders[0];
  const openOrders = orders.filter((order) => !['delivered', 'collected', 'cancelled', 'complete', 'completed'].includes(String(order.status || '').toLowerCase())).length;
  const buyAgain = useMemo(() => {
    const used = new Set();
    const items = orders.flatMap((order) => order.items || []).filter((item) => {
      const key = itemKey(item);
      if (!key || used.has(key)) return false;
      used.add(key);
      return true;
    });
    const matched = items.map((item) => products.find((product) => String(product.id) === String(item.productId || item.product_id) || String(product.code || '').toLowerCase() === String(item.code || item.sku || '').toLowerCase())).filter(Boolean);
    return matched.length ? matched.slice(0, 4) : products.slice(0, 4);
  }, [orders, products]);

  const add = (product) => {
    addToCart?.(product, 1);
    setMessage(`${product.name || product.description || 'Product'} added to your order`);
    window.setTimeout(() => setMessage(''), 2400);
  };

  if (!customer?.id) return null;

  return <section className="customer-dashboard" aria-labelledby="customer-dashboard-title">
    <div className="customer-dashboard-hero">
      <div className="customer-dashboard-identity">
        <span className="customer-dashboard-eyebrow">{orders.length ? 'WELCOME BACK,' : 'WELCOME TO PROTO,'}</span>
        <h1 id="customer-dashboard-title">{orders.length ? firstName(customer) : 'Your trade account is ready'}</h1>
        <p>{orders.length ? <>Wholesale account <i>•</i> <strong><ShieldCheck size={14} /> Approved</strong></> : 'Approved wholesale access • Start building your first order'}</p>
      </div>
      <div className="customer-dashboard-next">
        <span>{orders.length ? 'LAST ORDER' : 'YOUR NEXT STEP'}</span>
        <b>{orders.length ? `R${orderVatSummary(latest).totalInclVat.toFixed(2)}` : 'Start shopping'}</b>
        <small>{orders.length ? formatDate(latest.created_at) : 'Explore the catalogue and add products to your order'}</small>
        <ChevronRight size={18} />
      </div>
      <button className="customer-dashboard-cta" type="button" onClick={onContinueShopping}><ShoppingBag size={21} /><span><b>{orders.length ? 'Continue shopping' : 'Start shopping'}</b><small>Browse catalogue</small></span></button>
    </div>

    <div className="customer-dashboard-summary">
      <button type="button" className="customer-dashboard-profile" onClick={onViewProfile}><span className="customer-dashboard-round"><Truck size={20} /></span><span><b>Trade profile</b><small>{customer.business_name || 'Approved trade account'}</small><strong>View profile <ChevronRight size={13} /></strong></span><ChevronRight className="customer-dashboard-summary-end" size={18} /></button>
      <div className="customer-dashboard-metrics"><div><span>ACCOUNT STATUS</span><b>Approved</b><small>Ready to shop</small></div><div><span>LAST ORDER</span><b>{latest ? `R${orderVatSummary(latest).totalInclVat.toFixed(2)}` : 'None yet'}</b><small>{latest ? formatDate(latest.created_at) : 'Your first order starts here'}</small></div><button type="button" onClick={onViewOrders}><span>OPEN ORDERS</span><b>{openOrders}</b><small>View orders</small></button></div>
    </div>

    <div className="customer-dashboard-workspace">
      <div className="customer-dashboard-orders"><div className="customer-dashboard-section-heading"><h2>Recent orders</h2><button type="button" onClick={onViewOrders}>View all orders <ChevronRight size={14} /></button></div>{orders.length ? <>{orders.slice(0, 5).map((order) => <div className="customer-dashboard-order" key={order.id}><b>{order.order_number || String(order.id).slice(0, 8)}</b><span>{formatDate(order.created_at)}</span><span className="customer-dashboard-status"><i />{customerOrderStatus(order.status)}</span><strong>R{orderVatSummary(order).totalInclVat.toFixed(2)}</strong><button type="button" onClick={onViewOrders}>View order</button></div>)}</> : <div className="customer-dashboard-empty"><Box size={22} /><p>You have not placed an online order yet.</p><button type="button" onClick={onContinueShopping}>Start shopping <ArrowRight size={14} /></button></div>}<button className="customer-dashboard-bottom-link" type="button" onClick={onViewOrders}>View all orders <ChevronRight size={14} /></button></div>
      <div className="customer-dashboard-buy"><div className="customer-dashboard-section-heading"><h2>{orders.length ? 'Buy again' : 'Popular with trade customers'}</h2><span className="customer-dashboard-section-note">{orders.length ? 'From your previous orders' : 'A simple place to start'}</span></div><div className="customer-dashboard-products">{buyAgain.map((product) => <article key={product.id} className="customer-dashboard-product"><button className="customer-dashboard-heart" type="button" aria-label={`Save ${product.name || 'product'}`}><Heart size={15} /></button><img src={product.image_url || product.image || product.imageUrl || ''} alt={product.name || product.description || ''} /><b>{product.name || product.description}</b><small>{product.unitsOfIssue || product.selling_unit || product.unit || 'Each'}</small><strong>R{Number(product.price_incl_vat ?? product.price ?? 0).toFixed(2)}</strong><em>Incl. VAT</em><button className="customer-dashboard-add" type="button" onClick={() => add(product)}>Add to order <ShoppingCart size={13} /></button></article>)}</div></div>
    </div>
    <div className="customer-dashboard-trust"><span><Tag /><b>Trade pricing</b></span><span><Truck /><b>Reliable delivery</b></span><span><ShoppingBag /><b>Easy repeat ordering</b></span></div>
    {message && <div className="customer-dashboard-toast" role="status">{message}</div>}
  </section>;
}

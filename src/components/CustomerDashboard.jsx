import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, CircleHelp, Package, ShoppingBag, ShoppingCart, UserRound, X } from 'lucide-react';
import { fetchOrderHistory } from '../lib/orders';
import { customerOrderStatus, orderVatSummary } from '../lib/orderPresentation';
import { openIntercom } from '../lib/intercom';
import { fetchProductsBySkus } from '../lib/products';

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

function formatRand(value) {
  return `R${Number(value || 0).toFixed(2)}`;
}

const GREETING_SEEN_PREFIX = 'proto_dashboard_greeting_seen:';

function greetingSeenKey(customerId) {
  return `${GREETING_SEEN_PREFIX}${String(customerId || '').trim()}`;
}

function hasSeenGreeting(customerId) {
  try { return localStorage.getItem(greetingSeenKey(customerId)) === '1'; } catch { return false; }
}

function markGreetingSeen(customerId) {
  try { localStorage.setItem(greetingSeenKey(customerId), '1'); } catch { /* ignore */ }
}

export default function CustomerDashboard({
  customer,
  products = [],
  categories = [],
  cartItemCount = 0,
  cartTotal = 0,
  addToCart,
  onOpenCart,
  onViewOrders,
  onViewProfile,
  onContinueShopping,
  onBrowseDepartment,
}) {
  const [orders, setOrders] = useState([]);
  const [historyState, setHistoryState] = useState('loading');
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [buyAgain, setBuyAgain] = useState([]);
  const [buyAgainState, setBuyAgainState] = useState('idle');
  const [message, setMessage] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);

  useEffect(() => {
    if (!customer?.id) return undefined;
    let active = true;
    setHistoryState('loading');
    fetchOrderHistory(customer.id, 10)
      .then((rows) => {
        if (!active) return;
        setOrders(Array.isArray(rows) ? rows : []);
        setHistoryState('ready');
      })
      .catch(() => { if (active) setHistoryState('error'); });
    return () => { active = false; };
  }, [customer?.id, historyAttempt]);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [profileOpen]);

  const latest = orders[0];
  const hasOrders = historyState === 'ready' && orders.length > 0;
  const hasCart = cartItemCount > 0;
  const hasReturningContext = historyState === 'ready' && (hasOrders || hasCart);
  const openOrders = orders.filter((order) => !['delivered', 'collected', 'cancelled', 'complete', 'completed'].includes(String(order.status || '').toLowerCase())).length;
  const orderedItems = useMemo(() => {
    const used = new Set();
    return orders.flatMap((order) => order.items || []).filter((item) => {
      const key = itemKey(item);
      if (!key || used.has(key)) return false;
      used.add(key);
      return true;
    });
  }, [orders]);

  useEffect(() => {
    if (!hasOrders || !orderedItems.length) {
      setBuyAgain([]);
      setBuyAgainState('ready');
      return undefined;
    }
    let active = true;
    setBuyAgainState('loading');
    const skus = orderedItems.map((item) => item.productId || item.product_id || item.code || item.sku);
    fetchProductsBySkus(skus).then((bySku) => {
      if (!active) return;
      const resolved = orderedItems.map((item) => {
        const keys = [item.productId, item.product_id, item.code, item.sku]
          .map((value) => String(value || '').toUpperCase());
        return keys.map((key) => bySku.get(key)).find(Boolean)
          || products.find((product) => keys.includes(String(product.id || product.code || product.sku || '').toUpperCase()));
      }).filter(Boolean).slice(0, 4);
      setBuyAgain(resolved);
      setBuyAgainState('ready');
    }).catch(() => { if (active) setBuyAgainState('ready'); });
    return () => { active = false; };
  }, [hasOrders, orderedItems, products]);

  const add = (product) => {
    addToCart?.(product, 1);
    setMessage(`${product.name || product.description || 'Product'} added to your order`);
    window.setTimeout(() => setMessage(''), 2400);
  };

  const dismissGreeting = useCallback(() => {
    if (!customer?.id) return;
    markGreetingSeen(customer.id);
    setShowGreeting(false);
  }, [customer?.id]);

  useEffect(() => {
    if (!customer?.id || !hasReturningContext || hasSeenGreeting(customer.id)) {
      setShowGreeting(false);
      return undefined;
    }
    setShowGreeting(true);
    const timer = window.setTimeout(dismissGreeting, 5500);
    const dismissOnScroll = () => dismissGreeting();
    window.addEventListener('scroll', dismissOnScroll, { passive: true, once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', dismissOnScroll);
    };
  }, [customer?.id, dismissGreeting, hasReturningContext]);

  if (!customer?.id) return null;

  const historyLoading = historyState === 'loading';
  const historyError = historyState === 'error';
  const heroTitle = hasReturningContext ? `Welcome back, ${firstName(customer)}` : `Welcome, ${firstName(customer)}`;
  const heroCopy = hasCart
    ? `Your order is ready to continue · ${cartItemCount} item${cartItemCount === 1 ? '' : 's'} saved`
    : hasOrders ? 'Pick up where you left off or discover something new.'
      : historyLoading ? 'Checking your account history.'
        : historyError ? 'We could not load your account history.' : 'Your first online order starts here.';

  return <section className="customer-dashboard" aria-labelledby="customer-dashboard-title" onClick={dismissGreeting}>
    <div className="customer-dashboard-hero">
      <div className="customer-dashboard-identity">
        <span className="customer-dashboard-eyebrow">PROTO TRADING ONLINE</span>
        <h1 id="customer-dashboard-title" className={`customer-dashboard-greeting${showGreeting ? '' : ' customer-dashboard-greeting--dismissed'}`}>
          {showGreeting ? heroTitle : hasReturningContext ? 'Your dashboard' : heroTitle}
        </h1>
        <p>{heroCopy}</p>
      </div>
      {hasCart ? <div className="customer-dashboard-order-value"><span>YOUR ORDER</span><b>{formatRand(cartTotal)}</b><small>{cartItemCount} item{cartItemCount === 1 ? '' : 's'} ready to review</small></div>
        : hasOrders ? <div className="customer-dashboard-order-value"><span>LAST ORDER</span><b>{formatRand(orderVatSummary(latest).totalInclVat)}</b><small>{formatDate(latest.created_at)}</small></div>
          : historyLoading ? <div className="customer-dashboard-order-value"><span>ACCOUNT HISTORY</span><b>Loading</b><small>Checking previous orders</small></div>
            : historyError ? <div className="customer-dashboard-order-value"><span>ACCOUNT HISTORY</span><b>Try again</b><button type="button" className="customer-dashboard-retry" onClick={() => setHistoryAttempt((attempt) => attempt + 1)}>Retry</button></div>
              : <div className="customer-dashboard-order-value"><span>FIRST ORDER</span><b>Start here</b><small>Choose products to sell</small></div>}
      <button className="customer-dashboard-cta" type="button" onClick={hasCart ? onOpenCart : onContinueShopping}>
        {hasCart ? <ShoppingCart size={21} /> : <ShoppingBag size={21} />}
        <span><b>{hasCart ? 'Continue order' : 'Browse catalogue'}</b><small>{hasCart ? 'Review your basket' : 'Find products to sell'}</small></span>
      </button>
    </div>

    {hasReturningContext && <div className="customer-dashboard-quickbar">
      <button type="button" className="customer-dashboard-profile" onClick={() => setProfileOpen(true)}><UserRound size={19} /><span><b>Your details</b><small>{customer.business_name || customer.name || 'Trade account'}</small></span><ChevronRight size={18} /></button>
      {hasOrders && <button type="button" className="customer-dashboard-quick-stat" onClick={onViewOrders}><span>OPEN ORDERS</span><b>{openOrders}</b><small>View order status</small></button>}
      {hasOrders && <div className="customer-dashboard-quick-stat"><span>LAST ORDER</span><b>{formatRand(orderVatSummary(latest).totalInclVat)}</b><small>{formatDate(latest.created_at)}</small></div>}
      <button type="button" className="customer-dashboard-help" onClick={openIntercom}><CircleHelp size={18} /><span><b>Need help?</b><small>Ask Proto</small></span></button>
    </div>}

    {historyLoading || historyError ? <div className="customer-dashboard-history-notice" role={historyError ? 'alert' : 'status'}>{historyLoading ? 'Loading your order history…' : <>We couldn’t load your orders. <button type="button" onClick={() => setHistoryAttempt((attempt) => attempt + 1)}>Try again</button></>}</div>
      : !hasReturningContext ? <div className="customer-dashboard-start"><div className="customer-dashboard-section-heading"><div><h2>Start with a department</h2><span>Browse the products you need most.</span></div></div><div className="customer-dashboard-departments">{categories.slice(0, 6).map((category) => <button type="button" key={category.id} onClick={() => onBrowseDepartment?.(category.id)}><Package size={17} /><span>{category.label}</span><ChevronRight size={15} /></button>)}</div></div>
      : !hasOrders ? <div className="customer-dashboard-cart-start">
      <div><h2>Your order is ready</h2><p>{cartItemCount} item{cartItemCount === 1 ? '' : 's'} saved. Review it whenever you’re ready.</p></div>
      <button type="button" onClick={onOpenCart}>Continue order <ChevronRight size={15} /></button>
    </div> : <div className="customer-dashboard-workspace">
      <div className="customer-dashboard-orders"><div className="customer-dashboard-section-heading"><h2>Recent orders</h2><button type="button" onClick={onViewOrders}>View all orders <ChevronRight size={14} /></button></div>{orders.slice(0, 5).map((order) => <div className="customer-dashboard-order" key={order.id}><b>{order.order_number || String(order.id).slice(0, 8)}</b><span>{formatDate(order.created_at)}</span><span className="customer-dashboard-status"><i />{customerOrderStatus(order.status)}</span><strong>{formatRand(orderVatSummary(order).totalInclVat)}</strong><button type="button" onClick={onViewOrders}>View order</button></div>)}</div>
      <div className="customer-dashboard-buy"><div className="customer-dashboard-section-heading"><div><h2>Buy again</h2><span>From your previous orders</span></div></div>{buyAgainState === 'loading' ? <p className="customer-dashboard-buy-empty">Finding products from your previous orders…</p> : buyAgain.length ? <div className="customer-dashboard-products">{buyAgain.map((product) => <article key={product.id} className="customer-dashboard-product"><img src={product.image_url || product.image || product.imageUrl || ''} alt={product.name || product.description || ''} /><b>{product.name || product.description}</b><small>{product.unitsOfIssue || product.selling_unit || product.unit || 'Each'}</small><strong>{formatRand(product.price_incl_vat ?? product.price)}</strong><em>Incl. VAT</em><button className="customer-dashboard-add" type="button" onClick={() => add(product)}>Add to order <ShoppingCart size={13} /></button></article>)}</div> : <p className="customer-dashboard-buy-empty">{orderedItems.length ? 'Previous products are not currently available online.' : 'Your previous order items will appear here when available.'} <button type="button" onClick={onViewOrders}>View orders</button></p>}</div>
    </div>}

    {profileOpen && <div className="customer-dashboard-modal-backdrop" onClick={() => setProfileOpen(false)}>
      <div className="customer-dashboard-profile-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-profile-title" onClick={(event) => event.stopPropagation()}>
        <button className="customer-dashboard-modal-close" type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)}><X size={18} /></button>
        <UserRound size={23} />
        <h2 id="dashboard-profile-title">Your details</h2>
        <dl><div><dt>Business</dt><dd>{customer.business_name || 'Proto Trading'}</dd></div><div><dt>Contact</dt><dd>{customer.contact_name || customer.name || '—'}</dd></div><div><dt>Email</dt><dd>{customer.email || '—'}</dd></div><div><dt>Delivery</dt><dd>{customer.delivery_address || customer.address || 'Add delivery details'}</dd></div></dl>
        <button type="button" className="customer-dashboard-profile-edit" onClick={() => { setProfileOpen(false); onViewProfile?.(); }}>Edit details <ArrowRight size={15} /></button>
      </div>
    </div>}
    {message && <div className="customer-dashboard-toast" role="status">{message}</div>}
  </section>;
}

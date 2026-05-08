import React, { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Drawer from './components/Drawer';
import StickyBar from './components/StickyBar';
import OrderConfirmModal from './components/OrderConfirmModal';
import MobileNav from './components/MobileNav';
import ReorderModal from './components/ReorderModal';
import { useHashNav, buildBreadcrumb } from './hooks/useHashNav';
import { useProductFilter, useCategoryCounts } from './hooks/useProductFilter';
import { fetchProducts } from './lib/products';
import { saveOrder, fetchLastOrder } from './lib/orders';
import { fuzzyFilter } from './lib/fuzzySearch';
import categories from './data/categories.json';
import './index.css';

function getProductImageUrl(product, siteOrigin = '') {
  const src = product.localImage || product.image || '';
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  if (!siteOrigin) return src;
  return `${siteOrigin}${src.startsWith('/') ? src : `/${src}`}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function buildOrderText(cartItems, cartTotal) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const divider = '-'.repeat(52);
  const lines = cartItems.map((item, n) => {
    const lineTotal = `R${(item.product.price * item.qty).toFixed(2)}`;
    const label = `${n + 1}. ${item.product.name} (${item.product.code}) x ${item.qty}`;
    const pad = Math.max(1, 52 - label.length - lineTotal.length);
    return label + ' '.repeat(pad) + lineTotal;
  });
  return [
    `Hi Proto Trading,`, ``,
    `Please process the following wholesale order request:`,
    `Date: ${date}`, ``, divider, ...lines, divider,
    `SUBTOTAL (excl. VAT):${' '.repeat(29)}R${cartTotal.toFixed(2)}`, ``,
    `Please confirm availability, pricing, and delivery.`, ``,
    `Thank you`,
  ].join('\n');
}

function sortProducts(products, sort) {
  const next = [...products];
  if (sort === 'price-low')  return next.sort((a, b) => a.price - b.price);
  if (sort === 'price-high') return next.sort((a, b) => b.price - a.price);
  if (sort === 'newest')     return next.sort((a, b) => Number(b.isNew) - Number(a.isNew));
  if (sort === 'code')       return next.sort((a, b) => a.code.localeCompare(b.code));
  return next.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

const HEADER_H = 72;
const STICKY_H = 56;

export default function App({ customer, onLogout, onViewProfile, onViewAdmin }) {
  const { path, refinements, navigate, back, setRefinement } = useHashNav();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState([]);
  const [showSpecials, setShowSpecials] = useState(false);
  const [reorderModal, setReorderModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  // Load products from Supabase (falls back to static JSON)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProducts()
      .then((products) => {
        if (!cancelled && products.length > 0) setAllProducts(products);
      })
      .catch(() => {
        // Fallback to static JSON
        fetch('/stockProducts.json')
          .then((r) => r.ok ? r.json() : Promise.reject())
          .then((products) => { if (!cancelled && Array.isArray(products)) setAllProducts(products); })
          .catch(() => {});
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load last order for reorder feature
  useEffect(() => {
    if (!customer?.id) return;
    fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
  }, [customer?.id]);

  // Filter products by customer tier for specials
  const visibleProducts = useMemo(() => {
    if (!showSpecials) return allProducts.filter((p) => !p.isArchived);
    const tier = customer?.tier || 'regular';
    return allProducts.filter((p) =>
      !p.isArchived &&
      p.isSpecial &&
      (p.specialVisibility === 'all' || p.specialVisibility === tier)
    );
  }, [allProducts, showSpecials, customer?.tier]);

  const categoryProducts = useProductFilter(visibleProducts, path, refinements);
  const filteredProducts = useMemo(() => {
    const searched = searchQuery.trim()
      ? fuzzyFilter(categoryProducts, searchQuery)
      : categoryProducts;
    return sortProducts(searched, sort);
  }, [categoryProducts, searchQuery, sort]);

  const counts = useCategoryCounts(visibleProducts);
  const breadcrumb = buildBreadcrumb(categories, path);

  const [modalOpen, setModalOpen] = useState(false);
  const [orderText, setOrderText] = useState('');
  const [orderStatus, setOrderStatus] = useState('idle');
  const [orderError, setOrderError] = useState('');
  const [customerDetails, setCustomerDetails] = useState({
    name: customer?.name || 'Trade Customer',
    email: customer?.email || '',
    phone: customer?.phone || '+27',
    region: customer?.delivery_address || 'To confirm',
  });

  const addToCart = (product, qty) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { product, qty }];
    });
  };

  const updateQty = (id, qty) => setCartItems((prev) =>
    prev.map((i) => i.product.id !== id ? i : { ...i, qty: Math.max(1, Math.min(9999, Number(qty) || 1)) })
  );

  const removeFromCart = (id) => setCartItems((prev) => prev.filter((i) => i.product.id !== id));
  const clearCart = () => setCartItems([]);

  const handleShortcut = (id) => {
    if (id === 'start')   { navigate([]); setSearchQuery(''); setShowSpecials(false); }
    if (id === 'hot')     { setSearchQuery('hot'); setShowSpecials(false); }
    if (id === 'new')     { setSearchQuery('new'); setShowSpecials(false); }
    if (id === 'specials') { setShowSpecials((v) => !v); setSearchQuery(''); navigate([]); }
  };

  const cartTotal = cartItems.reduce((acc, i) => acc + (i.product.price * i.qty), 0);
  const totalItemCount = cartItems.reduce((acc, i) => acc + i.qty, 0);

  const sendOrderEmail = async () => {
    if (!cartItems.length) return;
    const siteOrigin = window.location.origin;
    const text = buildOrderText(cartItems, cartTotal);
    setOrderText(text);
    setOrderStatus('sending');
    setOrderError('');
    setModalOpen(true);

    try {
      // Save order to Supabase
      if (customer?.id) {
        await saveOrder(customer.id, cartItems, cartTotal);
        // Refresh last order
        fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
      }

      // Send email via API
      const payload = {
        customer: customerDetails,
        totals: { subtotal: cartTotal },
        items: cartItems.map((item) => ({
          qty: item.qty,
          product: {
            id: item.product.id,
            code: item.product.code,
            name: item.product.name,
            price: item.product.price,
            image: getProductImageUrl(item.product, siteOrigin),
            remoteImage: item.product.image,
          },
        })),
      };

      const response = await fetch('/api/send-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Order email could not be sent');
      setOrderStatus('sent');
    } catch (err) {
      setOrderStatus('error');
      setOrderError(err.message || 'Order could not be sent');
    }
  };

  const handleReorder = (items) => {
    // Restore items from last order back into cart
    for (const item of items) {
      const product = allProducts.find((p) => p.id === item.productId || p.code === item.code);
      if (product) addToCart(product, item.qty);
    }
    setReorderModal(false);
  };

  const bodyH = `calc(100vh - ${HEADER_H}px - ${STICKY_H}px)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header
        cartItemCount={totalItemCount}
        cartTotal={cartTotal}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onMenuClick={() => setMobileMenuOpen(true)}
        customer={customer}
        onViewProfile={onViewProfile}
        onViewAdmin={onViewAdmin}
        onReorder={() => setReorderModal(true)}
        hasLastOrder={!!lastOrder}
        onLogout={onLogout}
      />

      <div className="main-layout" style={{ height: bodyH }}>
        <aside className="sidebar-rail">
          <Sidebar
            categories={categories}
            path={path}
            navigate={navigate}
            back={back}
            refinements={refinements}
            setRefinement={setRefinement}
            counts={counts}
          />
        </aside>

        <main className="content-area">
          <MainContent
            products={filteredProducts}
            allProductCount={visibleProducts.length}
            categoryProductCount={categoryProducts.length}
            addToCart={addToCart}
            path={path}
            navigate={navigate}
            breadcrumb={breadcrumb}
            refinements={refinements}
            setRefinement={setRefinement}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sort={sort}
            setSort={setSort}
            onShortcut={handleShortcut}
            showSpecials={showSpecials}
            loading={loading}
          />
        </main>

        <aside className="cart-drawer">
          <Drawer
            cartItems={cartItems}
            cartTotal={cartTotal}
            updateQty={updateQty}
            removeFromCart={removeFromCart}
            clearCart={clearCart}
            sendOrderEmail={sendOrderEmail}
          />
        </aside>
      </div>

      <StickyBar cartItems={cartItems} cartTotal={cartTotal} sendOrderEmail={sendOrderEmail} />

      <OrderConfirmModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        cartItems={cartItems}
        cartTotal={cartTotal}
        orderText={orderText}
        orderStatus={orderStatus}
        orderError={orderError}
        customerDetails={customerDetails}
        setCustomerDetails={setCustomerDetails}
      />

      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        categories={categories}
        path={path}
        navigate={navigate}
        counts={counts}
        breadcrumb={breadcrumb}
      />

      {reorderModal && (
        <ReorderModal
          lastOrder={lastOrder}
          onReorder={handleReorder}
          onClose={() => setReorderModal(false)}
        />
      )}
    </div>
  );
}

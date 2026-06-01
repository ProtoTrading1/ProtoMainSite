import { useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';
import Header from './components/Header';
import CartFlyAnimation from './components/CartFlyAnimation';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Drawer from './components/Drawer';
import OrderConfirmModal from './components/OrderConfirmModal';
import ReorderModal from './components/ReorderModal';
import { useHashNav, buildBreadcrumb } from './hooks/useHashNav';
import { fetchCategoryCounts, fetchDistinctCategories, fetchProductPage } from './lib/products';
import { saveOrder, fetchLastOrder } from './lib/orders';
import { fetchSpecials, buildSpecialsMap } from './lib/specials';
import { authHeaders } from './lib/authHeaders';
import categories from './data/categories.json';
import './index.css';

const HEADER_H = 72;
const TOPNAV_H = 0;
const CATALOG_PAGE_SIZE = 60;

function getProductImageUrl(product, siteOrigin = '') {
  const src = product.localImage || product.image || '';
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  if (!siteOrigin) return src;
  return `${siteOrigin}${src.startsWith('/') ? src : `/${src}`}`;
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
    'Hi Proto Trading,',
    '',
    'Please process the following wholesale order request:',
    `Date: ${date}`,
    '',
    divider,
    ...lines,
    divider,
    `SUBTOTAL (excl. VAT):${' '.repeat(29)}R${cartTotal.toFixed(2)}`,
    '',
    'Please confirm availability, pricing, and delivery.',
    '',
    'Thank you',
  ].join('\n');
}

function collectionLabel(collection) {
  if (collection === 'hot') return 'Hot Sellers';
  if (collection === 'new') return 'New Stock';
  if (collection === 'clearance') return 'Clearance Stock';
  if (collection === 'instock') return 'In Stock';
  if (collection === 'soldout') return 'Out of Stock';
  return 'All Products';
}

export default function App({ customer, onLogout, onViewProfile, onViewAdmin }) {
  const { path, refinements, navigate, setRefinement } = useHashNav();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [loading, setLoading] = useState(true);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [counts, setCounts] = useState({ '': 0 });
  const [usingFallback, setUsingFallback] = useState(false);
  const [page, setPage] = useState(1);
  const [cartItems, setCartItems] = useState([]);
  const [flyAnim, setFlyAnim] = useState(null);
  const [drawerPeek, setDrawerPeek] = useState(false);
  const drawerTimerRef = useRef(null);
  const [activeCollection, setActiveCollection] = useState('all');
  const [reorderModal, setReorderModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [browseCategories, setBrowseCategories] = useState([]);
  const [specialsMap, setSpecialsMap] = useState({});

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sort, activeCollection, path.join('/')]);

  useEffect(() => {
    if (!customer?.id) return;
    fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
  }, [customer?.id]);

  useEffect(() => {
    fetchDistinctCategories().then(setBrowseCategories).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSpecials().then((data) => setSpecialsMap(buildSpecialsMap(data))).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [pageData, nextCounts] = await Promise.all([
          fetchProductPage({
            page,
            pageSize: CATALOG_PAGE_SIZE,
            searchQuery,
            categoryPath: path,
            collection: activeCollection,
            sort,
          }),
          fetchCategoryCounts({ collection: activeCollection }),
        ]);

        if (cancelled) return;
        setUsingFallback(false);
        setCatalogProducts(pageData.products);
        setCatalogTotal(pageData.total);
        setCounts(nextCounts);
      } catch {
        const response = await fetch('/stockProducts.json');
        const fallback = await response.json();
        if (cancelled) return;
        let rows = Array.isArray(fallback) ? fallback : [];
        if (activeCollection === 'hot') rows = rows.filter((item) => (item.badges || []).includes('Hot seller'));
        if (activeCollection === 'new') rows = rows.filter((item) => item.isNew);
        if (activeCollection === 'clearance') rows = rows.filter((item) => item.isSpecial);
        if (activeCollection === 'instock') rows = rows.filter((item) => (item.stockOnHand ?? 0) > 0);
        if (activeCollection === 'soldout') rows = rows.filter((item) => (item.stockOnHand ?? 0) <= 0);
        if (path.length) rows = rows.filter((item) => path.every((seg, index) => item.categoryPath?.[index] === seg));
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          rows = rows.filter((item) => item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q));
        }
        setUsingFallback(true);
        setCatalogTotal(rows.length);
        setCatalogProducts(rows.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE));
        setCounts({ '': rows.length });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeCollection, page, path, searchQuery, sort]);

  const rawBreadcrumb = buildBreadcrumb(categories, path);
  const breadcrumb = rawBreadcrumb.length > 0 ? rawBreadcrumb
    : path.map((seg, i) => ({ label: seg, path: path.slice(0, i + 1) }));
  const recommendationProducts = useMemo(() => catalogProducts.slice(0, 4), [catalogProducts]);

  // Resolve the category node for the current path (used by CategoryLanding)
  const categoryNode = useMemo(() => {
    if (!path.length) return null;
    let node = categories.find((c) => c.id === path[0]) || null;
    for (let i = 1; i < path.length && node; i++) {
      node = (node.children || []).find((c) => c.id === path[i]) || null;
    }
    return node;
  }, [path]);

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

  useEffect(() => {
    setCustomerDetails({
      name: customer?.name || 'Trade Customer',
      email: customer?.email || '',
      phone: customer?.phone || '+27',
      region: customer?.delivery_address || 'To confirm',
    });
  }, [customer?.name, customer?.email, customer?.phone, customer?.delivery_address]);

  const addToCart = (product, qty, buttonPos = null) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + qty } : i));
      return [...prev, { product, qty }];
    });

    if (buttonPos) setFlyAnim(buttonPos);

    setDrawerPeek(true);
    if (drawerTimerRef.current) clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = setTimeout(() => setDrawerPeek(false), 5000);
  };

  const updateQty = (id, qty) => setCartItems((prev) => prev.map((i) => (i.product.id !== id ? i : { ...i, qty: Math.max(1, Math.min(9999, Number(qty) || 1)) })));
  const removeFromCart = (id) => setCartItems((prev) => prev.filter((i) => i.product.id !== id));
  const clearCart = () => setCartItems([]);

  const cartQtyMap = useMemo(() => {
    const map = {};
    for (const item of cartItems) map[item.product.id] = item.qty;
    return map;
  }, [cartItems]);

  const handleCartQtyChange = (product, newQty) => {
    if (newQty <= 0) removeFromCart(product.id);
    else updateQty(product.id, newQty);
  };

  const handleShortcut = (id) => {
    if (id === 'start') {
      setActiveCollection('all');
      setSearchQuery('');
      navigate([]);
    }
    if (id === 'hot') {
      setActiveCollection('hot');
      setSearchQuery('');
      navigate([]);
    }
    if (id === 'new') {
      setActiveCollection('new');
      setSearchQuery('');
      navigate([]);
    }
    if (id === 'clearance') {
      setActiveCollection('clearance');
      setSearchQuery('');
      navigate([]);
    }
    if (id === 'instock') {
      setActiveCollection('instock');
      setSearchQuery('');
      navigate([]);
    }
    if (id === 'soldout') {
      setActiveCollection('soldout');
      setSearchQuery('');
      navigate([]);
    }
  };

  const cartTotal = cartItems.reduce((acc, i) => acc + i.product.price * i.qty, 0);
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
      if (customer?.id) {
        await saveOrder(customer.id, cartItems, cartTotal);
        fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
      }

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
        headers: await authHeaders(),
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
    const selectedItems = items
      .map((item) => {
        const product = catalogProducts.find((p) => p.id === item.productId || p.code === item.code);
        return product ? { product, qty: item.qty } : null;
      })
      .filter(Boolean);

    setCartItems((prev) => {
      const next = [...prev];
      for (const item of selectedItems) {
        const existing = next.find((entry) => entry.product.id === item.product.id);
        if (existing) existing.qty += item.qty;
        else next.push(item);
      }
      return next;
    });

    setReorderModal(false);
  };

  const bodyH = `calc(100vh - ${HEADER_H}px - ${TOPNAV_H}px)`;
  const totalPages = Math.max(1, Math.ceil(catalogTotal / CATALOG_PAGE_SIZE));

  return (
    <div className="app-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
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
        onSpecials={() => handleShortcut('clearance')}
        onCartClick={() => setMobileCartOpen(true)}
      />

      <div className="main-layout" style={{ height: bodyH }}>
        <aside className="sidebar-rail">
          <Sidebar
            categories={categories}
            path={path}
            navigate={navigate}
            setRefinement={setRefinement}
            counts={counts}
          />
        </aside>

        <main className="content-area">
          <MainContent
            products={catalogProducts}
            allProductCount={counts[''] || catalogTotal}
            categoryProductCount={catalogTotal}
            addToCart={addToCart}
            cartQtyMap={cartQtyMap}
            onCartQtyChange={handleCartQtyChange}
            specialsMap={specialsMap}
            path={path}
            navigate={navigate}
            breadcrumb={breadcrumb}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sort={sort}
            setSort={setSort}
            onShortcut={handleShortcut}
            activeCollection={activeCollection}
            collectionLabel={collectionLabel(activeCollection)}
            recommendationProducts={recommendationProducts}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            usingFallback={usingFallback}
            browseCategories={browseCategories}
            categoryCounts={counts}
            categoryNode={categoryNode}
          />
        </main>

        <aside className={`cart-drawer${drawerPeek ? ' peek' : ''}`}>
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

      {reorderModal && <ReorderModal lastOrder={lastOrder} onReorder={handleReorder} onClose={() => setReorderModal(false)} />}

      {flyAnim && <CartFlyAnimation from={flyAnim} onDone={() => setFlyAnim(null)} />}

      {/* Mobile cart FAB */}
      <button
        className="mobile-cart-fab"
        onClick={() => setMobileCartOpen(true)}
        type="button"
        aria-label="Open cart"
      >
        <ShoppingCart size={18} />
        {totalItemCount > 0 && (
          <span className="mobile-cart-fab-badge">{totalItemCount}</span>
        )}
        <span>R{cartTotal.toFixed(2)}</span>
      </button>

      {/* Mobile cart bottom sheet */}
      {mobileCartOpen && (
        <div className="mobile-cart-backdrop" onClick={() => setMobileCartOpen(false)}>
          <div className="mobile-cart-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-cart-sheet-handle" />
            <div className="mobile-cart-sheet-header">
              <span className="mobile-cart-sheet-title">Your Order</span>
              <button
                type="button"
                className="mobile-cart-sheet-close"
                onClick={() => setMobileCartOpen(false)}
                aria-label="Close cart"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mobile-cart-sheet-body">
              <Drawer
                cartItems={cartItems}
                cartTotal={cartTotal}
                updateQty={updateQty}
                removeFromCart={removeFromCart}
                clearCart={clearCart}
                sendOrderEmail={() => { setMobileCartOpen(false); sendOrderEmail(); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

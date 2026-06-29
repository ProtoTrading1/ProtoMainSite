import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import MobileNav from './components/MobileNav';
import Drawer from './components/Drawer';
import ProductCard from './components/ProductCard';

import lazyWithRetry from './lib/lazyWithRetry';

// Lazy-loaded: only fetched when the user actually triggers these interactions.
const CartFlyAnimation = lazyWithRetry(() => import('./components/CartFlyAnimation'), 'app-cart-fly-animation');
const OrderConfirmModal = lazyWithRetry(() => import('./components/OrderConfirmModal'), 'app-order-confirm-modal');
const ReorderModal = lazyWithRetry(() => import('./components/ReorderModal'), 'app-reorder-modal');
import { useHashNav, buildBreadcrumb } from './hooks/useHashNav';
import { fetchCategoryCounts, fetchDistinctCategories, fetchProductPage } from './lib/products';
import { groupProductsByBarcode } from './lib/productGroups';
import { fuzzyFilter } from './lib/fuzzySearch';
import { saveOrder, fetchLastOrder } from './lib/orders';
import { fetchSpecials, buildSpecialsMap } from './lib/specials';
import { fetchBanner, invalidateBannerCache } from './lib/banner';
import { fetchPopupSpecial, shouldShowPopup, dismissPopup } from './lib/popupSpecial';
import PopupSpecialModal from './components/PopupSpecialModal';
import { authHeaders } from './lib/authHeaders';
import { trackEvent } from './lib/trackEvent';
import { logSearch, logSearchClick, logSearchCartAdd, logSearchOrder } from './lib/searchAnalytics';
import { useLiveTaxonomy } from './lib/useLiveTaxonomy';
import { resolveNavPathForProducts } from './lib/taxonomy';
import { scrollToTop } from './lib/scrollToTop';
import './index.css';

const HEADER_H = 72;
const TOPNAV_H = 0;
const CATALOG_PAGE_SIZE = 60;
const DRAWER_PEEK_MS = 5000;

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
    `SUBTOTAL (incl. VAT):${' '.repeat(29)}R${cartTotal.toFixed(2)}`,
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
  if (collection === 'specials') return "This Week's Specials";
  if (collection === 'instock') return 'In Stock';
  if (collection === 'soldout') return 'Out of Stock';
  return 'All Products';
}

export default function App({ customer, onLogout, onViewProfile, onViewAdmin }) {
  const { path, refinements, navigate: hashNavigate, setRefinement } = useHashNav();
  // Live category tree — fetched from /api/taxonomy on mount so admin renames
  // and new subcategories show up without a redeploy of the bundled snapshot.
  const categories = useLiveTaxonomy();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navigate = useCallback((newPath, newRefinements) => {
    setSearchQuery('');
    scrollToTop();
    hashNavigate(newPath, newRefinements);
  }, [hashNavigate]);

  const navigateForSearch = useCallback((newPath, newRefinements) => {
    scrollToTop();
    hashNavigate(newPath, newRefinements);
  }, [hashNavigate]);
  const [sort, setSort] = useState('featured');
  const [loading, setLoading] = useState(true);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [counts, setCounts] = useState({ '': 0 });
  const [usingFallback, setUsingFallback] = useState(false);
  const [page, setPage] = useState(1);
  const [cartItems, setCartItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('proto_cart') || '[]'); } catch { return []; }
  });
  const [flyAnim, setFlyAnim] = useState(null);
  const [drawerPeek, setDrawerPeek] = useState(false);
  const drawerTimerRef = useRef(null);
  const searchTrackRef = useRef({ rowId: null, searchedAt: null, term: '' });
  const lastSearchLogKeyRef = useRef('');
  const [activeCollection, setActiveCollection] = useState('all');
  const [reorderModal, setReorderModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [browseCategories, setBrowseCategories] = useState([]);
  const [specialsMap, setSpecialsMap] = useState({});
  const [bannerConfig, setBannerConfig] = useState(null);
  const [popupConfig, setPopupConfig] = useState(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('proto_cart', JSON.stringify(cartItems)); } catch { /* ignore */ }
  }, [cartItems]);

  // Scope the cart to the logged-in account. If a different user signs in
  // (e.g. a brand-new account), drop the previous user's cart so it never
  // carries over between accounts.
  useEffect(() => {
    const uid = customer?.id || null;
    if (!uid) return;
    let owner = null;
    try { owner = localStorage.getItem('proto_cart_owner'); } catch { /* ignore */ }
    if (owner && owner !== uid) {
      setCartItems([]);
      try { localStorage.removeItem('proto_cart'); } catch { /* ignore */ }
    }
    try { localStorage.setItem('proto_cart_owner', uid); } catch { /* ignore */ }
  }, [customer?.id]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sort, activeCollection, path.join('/')]);

  // Graceful fallback for legacy/unknown category slugs (taxonomy changed):
  // if the first path segment isn't a known department, resolve to the
  // catalogue root instead of showing an empty/broken page.
  useEffect(() => {
    if (path.length && !categories.some((c) => c.id === path[0])) {
      hashNavigate([]);
    }
  }, [path, hashNavigate]);

  const pathKey = path.join('/');
  const navScrollKey = `${pathKey}|${page}|${activeCollection}|${searchQuery}|${sort}`;

  // useLayoutEffect so scroll resets before paint; also re-run after catalog loads
  // because shorter pages + scroll anchoring can leave the viewport at the bottom.
  useLayoutEffect(() => {
    scrollToTop();
  }, [navScrollKey]);

  useLayoutEffect(() => {
    if (!loading) scrollToTop();
  }, [loading, navScrollKey]);

  const handlePageChange = useCallback((nextPage) => {
    scrollToTop();
    setPage(nextPage);
  }, []);

  useEffect(() => {
    if (!path.length) return;
    const crumbs = buildBreadcrumb(path, categories);
    const label = crumbs.map((c) => c.label).join(' › ') || path.join(' › ');
    trackEvent({
      eventType: 'category_view',
      entityId: path.join('/'),
      entityLabel: label,
      customerId: customer?.id,
    });
  }, [path.join('/'), customer?.id]);

  useEffect(() => {
    if (!customer?.id) return;
    fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
  }, [customer?.id]);

  useEffect(() => {
    fetchDistinctCategories().then(setBrowseCategories).catch(() => {});
  }, []);

  const loadBanner = useCallback(() => {
    invalidateBannerCache();
    return fetchBanner({ force: true })
      .then((data) => { if (data) setBannerConfig(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSpecials().then((data) => setSpecialsMap(buildSpecialsMap(data))).catch(() => {});
    loadBanner();
    fetchPopupSpecial().then((data) => {
      setPopupConfig(data);
      if (shouldShowPopup(data)) setShowPopup(true);
    }).catch(() => {});
  }, [loadBanner]);

  useEffect(() => {
    const refresh = () => { void loadBanner(); };
    window.addEventListener('focus', refresh);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadBanner]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const specialIds = activeCollection === 'specials' ? new Set(Object.keys(specialsMap)) : null;
        const [pageData, nextCounts] = await Promise.all([
          fetchProductPage({
            page,
            pageSize: CATALOG_PAGE_SIZE,
            searchQuery,
            categoryPath: path,
            collection: activeCollection,
            sort,
            specialIds,
          }),
          fetchCategoryCounts({ collection: activeCollection }),
        ]);

        if (cancelled) return;
        setUsingFallback(false);

        // If a deep subcategory returns nothing (e.g. out-of-stock leaf),
        // fall back to showing the top-level department so the page isn't empty.
        if (pageData.total === 0 && path.length > 1 && !searchQuery && activeCollection === 'all') {
          const l1Data = await fetchProductPage({
            page: 1,
            pageSize: CATALOG_PAGE_SIZE,
            searchQuery: '',
            categoryPath: path.slice(0, 1),
            collection: 'all',
            sort,
          });
          if (!cancelled && l1Data.total > 0) {
            setCatalogProducts(l1Data.products);
            setCatalogTotal(l1Data.total);
            setCounts(nextCounts);
            return;
          }
        }

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
        const hasSearch = Boolean(searchQuery.trim());
        if (!hasSearch && path.length) {
          const resolved = resolveNavPathForProducts(path, categories);
          rows = rows.filter((item) => resolved.every((seg, index) => item.categoryPath?.[index] === seg));
        }
        if (hasSearch) rows = fuzzyFilter(rows, searchQuery);
        rows = groupProductsByBarcode(rows);
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
  }, [activeCollection, page, path, searchQuery, sort, categories]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      searchTrackRef.current = { rowId: null, searchedAt: null, term: '' };
      lastSearchLogKeyRef.current = '';
      return;
    }
    if (loading) return;

    const term = searchQuery.trim();
    if (term.length < 3) return;

    const logKey = `${term}|${pathKey}|${activeCollection}`;
    if (lastSearchLogKeyRef.current === logKey) return;

    let cancelled = false;
    const searchedAt = new Date();
    const filtersApplied = [];
    if (activeCollection !== 'all') filtersApplied.push(collectionLabel(activeCollection));
    if (path.length) filtersApplied.push(...path);

    const timer = setTimeout(() => {
      void logSearch({
        searchTerm: term,
        resultsFound: catalogTotal,
        customerId: customer?.id ?? null,
        customerEmail: customer?.email ?? null,
        filtersApplied,
      }).then((id) => {
        if (!cancelled && id) {
          lastSearchLogKeyRef.current = logKey;
          searchTrackRef.current = { rowId: id, searchedAt, term };
        }
      });
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, catalogTotal, loading, activeCollection, pathKey, customer?.id, customer?.email]);

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

  useEffect(() => () => {
    if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
  }, []);

  const addToCart = (product, qty, buttonPos = null) => {
    const maxQty = product.stockQty || 9999;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => (i.product.id === product.id ? { ...i, qty: Math.min(maxQty, i.qty + qty) } : i));
      return [...prev, { product, qty: Math.min(maxQty, qty) }];
    });

    if (searchTrackRef.current.rowId && searchQuery.trim()) {
      void logSearchCartAdd(searchTrackRef.current.rowId);
    }

    if (buttonPos) setFlyAnim(buttonPos);

    setDrawerPeek(true);
    if (drawerTimerRef.current) clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = setTimeout(() => setDrawerPeek(false), DRAWER_PEEK_MS);
  };

  const updateQty = (id, qty) => setCartItems((prev) => prev.map((i) => (i.product.id !== id ? i : { ...i, qty: Math.max(1, Math.min(i.product.stockQty || 9999, Number(qty) || 1)) })));
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
    if (id === 'specials') {
      setActiveCollection('specials');
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

  const sendOrderEmail = async (opts = {}) => {
    if (!cartItems.length) return;
    const courierChoice = opts?.courierChoice || null;
    const customerNotes = String(opts?.customerNotes || '').trim();
    const deliveryMethod = courierChoice === 'own'
      ? "Customer's own courier"
      : courierChoice === 'proto'
        ? 'Proto Trading delivers'
        : null;

    if (!deliveryMethod) {
      setOrderError('Please choose a delivery option before submitting.');
      setOrderStatus('error');
      setModalOpen(true);
      return;
    }

    const siteOrigin = window.location.origin;
    const text = buildOrderText(cartItems, cartTotal);
    setOrderText(text);
    setOrderStatus('sending');
    setOrderError('');
    setModalOpen(true);

    try {
      let savedOrder = null;
      if (customer?.id) {
        savedOrder = await saveOrder(customer.id, cartItems, cartTotal, { deliveryMethod, customerNotes });
        fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
      }

      const payload = {
        customer: customerDetails,
        totals: { subtotal: cartTotal },
        deliveryMethod,
        customerNotes,
        orderId: savedOrder?.id || null,
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
      if (!response.ok) throw new Error(result.error || 'Order could not be sent');

      if (result.emailDeliveryFailed) {
        setOrderStatus('saved');
      } else {
        setOrderStatus('sent');
      }

      clearCart();
      setMobileCartOpen(false);
      setCartDrawerOpen(false);

      if (searchTrackRef.current.rowId) {
        void logSearchOrder({
          searchRowId: searchTrackRef.current.rowId,
          orderNumber: savedOrder?.id || payload.orderId || '',
          orderValue: cartTotal,
        });
      }
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

  const [previewProduct, setPreviewProduct] = useState(null);

  const handleSearchProductClick = useCallback((product, index) => {
    const track = searchTrackRef.current;
    if (!track.rowId || !searchQuery.trim()) return;
    void logSearchClick({
      searchRowId: track.rowId,
      clickedSku: product.code || product.id,
      position: index + 1 + (page - 1) * CATALOG_PAGE_SIZE,
      searchedAt: track.searchedAt,
    });
  }, [searchQuery, page]);

  const bodyH = `calc(100vh - ${HEADER_H}px - ${TOPNAV_H}px)`;
  const totalPages = Math.max(1, Math.ceil(catalogTotal / CATALOG_PAGE_SIZE));

  return (
    <div className="app-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header
        cartItemCount={totalItemCount}
        cartTotal={cartTotal}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        navigateForSearch={navigateForSearch}
        onMenuClick={() => setMobileMenuOpen(true)}
        onHome={() => { navigate([]); setActiveCollection('all'); scrollToTop(); }}
        customer={customer}
        onViewProfile={onViewProfile}
        onViewAdmin={onViewAdmin}
        onReorder={() => setReorderModal(true)}
        hasLastOrder={!!lastOrder}
        onLogout={onLogout}
        onSpecials={() => handleShortcut('specials')}
        onCartClick={() => { if (window.innerWidth > 1200) setCartDrawerOpen(true); else setMobileCartOpen(true); }}
      />

      <div className="main-layout" style={{ height: bodyH }}>
        <aside className="sidebar-rail">
          <Sidebar
            categories={categories}
            path={path}
            navigate={navigate}
            setRefinement={setRefinement}
            counts={counts}
            customer={customer}
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
            onPageChange={handlePageChange}
            bannerConfig={bannerConfig}
            usingFallback={usingFallback}
            browseCategories={browseCategories}
            categoryCounts={counts}
            categoryNode={categoryNode}
            categories={categories}
            onProductPreview={setPreviewProduct}
            searchActive={Boolean(searchQuery.trim())}
            onSearchProductClick={handleSearchProductClick}
          />
        </main>

        <aside className={`cart-drawer${cartDrawerOpen ? ' open' : drawerPeek ? ' peek' : ''}`}>
          <Drawer
            cartItems={cartItems}
            cartTotal={cartTotal}
            updateQty={updateQty}
            removeFromCart={removeFromCart}
            clearCart={clearCart}
            sendOrderEmail={sendOrderEmail}
            autoCloseProgress={0}
            showAutoCloseBar={false}
            onClose={() => setCartDrawerOpen(false)}
          />
        </aside>
      </div>

      <Suspense fallback={null}>
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
      </Suspense>

      {reorderModal && <Suspense fallback={null}><ReorderModal lastOrder={lastOrder} onReorder={handleReorder} onClose={() => setReorderModal(false)} /></Suspense>}

      {flyAnim && <Suspense fallback={null}><CartFlyAnimation from={flyAnim} onDone={() => setFlyAnim(null)} /></Suspense>}

      {/* Global product preview — triggered from strip cards in category landings */}
      {previewProduct && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px' }}>
          <ProductCard
            product={previewProduct}
            addToCart={addToCart}
            cartQty={cartQtyMap[previewProduct.id] || 0}
            onCartQtyChange={handleCartQtyChange}
            special={specialsMap[previewProduct.id] || null}
            initialZoomOpen={true}
            onZoomClose={() => setPreviewProduct(null)}
          />
        </div>
      )}

      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        categories={categories}
        path={path}
        navigate={(p) => { navigate(p); setMobileMenuOpen(false); }}
        counts={counts}
        breadcrumb={breadcrumb}
        customer={customer}
        onViewProfile={onViewProfile}
        onViewAdmin={onViewAdmin}
        onLogout={onLogout}
        onHome={() => { navigate([]); setActiveCollection('all'); setMobileMenuOpen(false); scrollToTop(); }}
        onSpecials={() => { handleShortcut('specials'); setMobileMenuOpen(false); }}
        onReorder={lastOrder ? () => { setReorderModal(true); setMobileMenuOpen(false); } : null}
      />

      {/* Mobile cart — opened from bottom tab bar */}
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
                sendOrderEmail={(opts) => { setMobileCartOpen(false); sendOrderEmail(opts); }}
              />
            </div>
          </div>
        </div>
      )}

      {showPopup && popupConfig?.imageUrl && (
        <PopupSpecialModal
          imageUrl={popupConfig.imageUrl}
          onDismiss={() => {
            dismissPopup(popupConfig);
            setShowPopup(false);
          }}
        />
      )}
    </div>
  );
}

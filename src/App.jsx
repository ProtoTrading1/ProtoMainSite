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
import { fetchCategoryCounts, fetchDistinctCategories, fetchProductPage, isProductAvailable, sortCatalogProducts, DEFAULT_SORT, normalizeCatalogSort, subscribeCatalogRefresh } from './lib/products';
import { preloadProductImages } from './lib/imageUrl';
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
import { scrollToTop, scrollToTopSmooth } from './lib/scrollToTop';
import './index.css';

const HEADER_H = 72;
const TOPNAV_H = 0;
const CATALOG_PAGE_SIZE = 60;
const DRAWER_PEEK_MS = 5000;
const WELCOME_DISMISSED_KEY = 'proto_welcome_dismissed';
const IN_STOCK_ONLY_KEY = 'proto_in_stock_only';
const CATALOG_SORT_KEY = 'proto_catalog_sort';
const CART_STORAGE_KEY = 'proto_cart';
const CART_OWNER_KEY = 'proto_cart_owner';
const CART_LAST_ACTIVITY_KEY = 'proto_cart_last_activity_at';
const CART_INACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CART_EXPIRY_WARN_MS = 72 * 60 * 60 * 1000;
const CART_EXPIRY_DANGER_MS = 24 * 60 * 60 * 1000;
const CART_QTY_UNLIMITED = 9999;

function readCartActivityAt() {
  try {
    const raw = Number(localStorage.getItem(CART_LAST_ACTIVITY_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

function readInStockOnly() {
  try { return sessionStorage.getItem(IN_STOCK_ONLY_KEY) === '1'; } catch { return false; }
}

function readInitialSort() {
  try {
    const stored = sessionStorage.getItem(CATALOG_SORT_KEY);
    if (stored) {
      return normalizeCatalogSort(stored);
    }
  } catch { /* ignore */ }
  return DEFAULT_SORT;
}

function hashHasCategoryPath() {
  if (typeof window === 'undefined') return false;
  const raw = window.location.hash.replace(/^#\/?/, '');
  const pathStr = (raw.split('?')[0] || '').trim();
  if (!pathStr) return false;
  const segments = pathStr.split('/').filter(Boolean);
  if (segments[0] === 'portal-preview') return segments.length > 1;
  return segments.length > 0;
}

function readInitialShowWelcome() {
  try {
    if (sessionStorage.getItem(WELCOME_DISMISSED_KEY)) return false;
  } catch { /* ignore */ }
  return !hashHasCategoryPath();
}

function getProductImageUrl(product, siteOrigin = '') {
  const src = product.localImage || product.image || '';
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  if (!siteOrigin) return src;
  return `${siteOrigin}${src.startsWith('/') ? src : `/${src}`}`;
}

function productStockQtyForCart(product) {
  const qtyRaw = product?.stockOnHand ?? product?.stockQty ?? product?.available_stock ?? product?.stock_qty;
  if (qtyRaw === undefined || qtyRaw === null || qtyRaw === '') return null;
  const qty = Number(qtyRaw);
  return Number.isFinite(qty) ? qty : null;
}

function productCanOrderWhenOos(product) {
  return product?.keepLiveWhenOos === true
    || product?.keep_live_when_oos === true
    || product?.orderableWhenOutOfStock === true
    || product?.orderable_when_out_of_stock === true;
}

function cartQtyCapForProduct(product) {
  if (!product) return 0;
  if (productCanOrderWhenOos(product)) return CART_QTY_UNLIMITED;

  const qty = productStockQtyForCart(product);
  if (qty === null) return product.inStock === false ? 0 : CART_QTY_UNLIMITED;
  if (qty > 0) return Math.floor(qty);
  if (qty === 0) return 0;
  // Negative SOH lines are valid backorders; do not clamp to a negative max.
  return CART_QTY_UNLIMITED;
}

function normalizeCartQtyInput(qty) {
  const numeric = Number(qty);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.floor(numeric));
}

function buildOrderText(cartItems, cartTotal, promo = null) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const divider = '-'.repeat(52);
  const lines = cartItems.map((item, n) => {
    const lineTotal = `R${(item.product.price * item.qty).toFixed(2)}`;
    const label = `${n + 1}. ${item.product.name} (${item.product.code}) x ${item.qty}`;
    const pad = Math.max(1, 52 - label.length - lineTotal.length);
    return label + ' '.repeat(pad) + lineTotal;
  });
  const footer = [`SUBTOTAL (incl. VAT):${' '.repeat(29)}R${cartTotal.toFixed(2)}`];
  if (promo?.code) {
    footer.push(`PROMO (${promo.code}, ${promo.discountPct}%):${' '.repeat(Math.max(1, 52 - 20 - promo.code.length))}-R${promo.discountAmount.toFixed(2)}`);
    footer.push(`EST. TOTAL (incl. VAT):${' '.repeat(22)}R${(promo.total ?? cartTotal - promo.discountAmount).toFixed(2)}`);
    footer.push('(Estimated — final pricing confirmed by reply.)');
  }
  return [
    'Hi Proto Trading,',
    '',
    'Please process the following wholesale order request:',
    `Date: ${date}`,
    '',
    divider,
    ...lines,
    divider,
    ...footer,
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
  const [showWelcome, setShowWelcome] = useState(readInitialShowWelcome);
  const [inStockOnly, setInStockOnly] = useState(readInStockOnly);
  const skipNavScrollRef = useRef(false);

  const dismissWelcome = useCallback(() => {
    setShowWelcome((prev) => {
      if (!prev) return prev;
      try { sessionStorage.setItem(WELCOME_DISMISSED_KEY, '1'); } catch { /* ignore */ }
      return false;
    });
  }, []);

  const handleInStockOnlyChange = useCallback((next) => {
    setInStockOnly(next);
    try {
      if (next) sessionStorage.setItem(IN_STOCK_ONLY_KEY, '1');
      else sessionStorage.removeItem(IN_STOCK_ONLY_KEY);
    } catch { /* ignore */ }
  }, []);

  const handleSortChange = useCallback((next) => {
    const normalized = normalizeCatalogSort(next);
    setSort(normalized);
    try { sessionStorage.setItem(CATALOG_SORT_KEY, normalized); } catch { /* ignore */ }
  }, []);

  const navigate = useCallback((newPath, newRefinements) => {
    setSearchQuery('');
    scrollToTop();
    hashNavigate(newPath, newRefinements);
  }, [hashNavigate]);

  const goAllProducts = useCallback(() => {
    dismissWelcome();
    navigate([]);
  }, [dismissWelcome, navigate]);

  const navigateForSearch = useCallback((newPath, newRefinements) => {
    scrollToTop();
    hashNavigate(newPath, newRefinements);
  }, [hashNavigate]);
  const [sort, setSort] = useState(readInitialSort);
  const [loading, setLoading] = useState(true);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [counts, setCounts] = useState({ '': 0 });
  const [usingFallback, setUsingFallback] = useState(false);
  const [page, setPage] = useState(1);
  const [cartItems, setCartItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [cartLastActivityAt, setCartLastActivityAt] = useState(readCartActivityAt);
  const [cartClock, setCartClock] = useState(Date.now());
  const [flyAnim, setFlyAnim] = useState(null);
  const [drawerPeek, setDrawerPeek] = useState(false);
  const drawerTimerRef = useRef(null);
  const searchTrackRef = useRef({ rowId: null, searchedAt: null, term: '' });
  const lastSearchLogKeyRef = useRef('');
  const [activeCollection, setActiveCollection] = useState('all');
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [reorderModal, setReorderModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [browseCategories, setBrowseCategories] = useState([]);
  const [specialsMap, setSpecialsMap] = useState({});
  const [bannerConfig, setBannerConfig] = useState(null);
  const [popupConfig, setPopupConfig] = useState(null);
  const [showPopup, setShowPopup] = useState(false);

  const goHome = useCallback(() => {
    skipNavScrollRef.current = true;
    try { sessionStorage.removeItem(WELCOME_DISMISSED_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(IN_STOCK_ONLY_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(CATALOG_SORT_KEY); } catch { /* ignore */ }
    setShowWelcome(true);
    setSearchQuery('');
    setActiveCollection('all');
    setSort(DEFAULT_SORT);
    setInStockOnly(false);
    hashNavigate([], {});
    scrollToTopSmooth();
  }, [hashNavigate]);

  useEffect(() => {
    if (searchQuery.trim()) dismissWelcome();
  }, [searchQuery, dismissWelcome]);

  useEffect(() => {
    if (path.length > 0) dismissWelcome();
  }, [path.join('/'), dismissWelcome]);

  useEffect(() => {
    if (activeCollection !== 'all') dismissWelcome();
  }, [activeCollection, dismissWelcome]);

  useEffect(() => {
    if (Object.keys(refinements).length > 0) dismissWelcome();
  }, [refinements, dismissWelcome]);

  useEffect(() => {
    try {
      if (cartItems.length) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
      else localStorage.removeItem(CART_STORAGE_KEY);
    } catch { /* ignore */ }
  }, [cartItems]);

  useEffect(() => {
    if (!cartItems.length) {
      if (cartLastActivityAt !== null) setCartLastActivityAt(null);
      try { localStorage.removeItem(CART_LAST_ACTIVITY_KEY); } catch { /* ignore */ }
      return;
    }
    if (cartLastActivityAt) return;
    const now = Date.now();
    setCartLastActivityAt(now);
    try { localStorage.setItem(CART_LAST_ACTIVITY_KEY, String(now)); } catch { /* ignore */ }
  }, [cartItems.length, cartLastActivityAt]);

  // Scope the cart to the logged-in account. If a different user signs in
  // (e.g. a brand-new account), drop the previous user's cart so it never
  // carries over between accounts.
  useEffect(() => {
    const uid = customer?.id || null;
    if (!uid) return;
    let owner = null;
    try { owner = localStorage.getItem(CART_OWNER_KEY); } catch { /* ignore */ }
    if (owner && owner !== uid) {
      setCartItems([]);
      setCartLastActivityAt(null);
      try {
        localStorage.removeItem(CART_STORAGE_KEY);
        localStorage.removeItem(CART_LAST_ACTIVITY_KEY);
      } catch { /* ignore */ }
    }
    try { localStorage.setItem(CART_OWNER_KEY, uid); } catch { /* ignore */ }
  }, [customer?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setCartClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [path.join('/')]);

  // Graceful fallback for legacy/unknown category slugs (taxonomy changed):
  // if the first path segment isn't a known department, resolve to the
  // catalogue root instead of showing an empty/broken page.
  useEffect(() => {
    if (path.length && !categories.some((c) => c.id === path[0])) {
      hashNavigate([]);
    }
  }, [path, hashNavigate]);

  const pathKey = path.join('/');

  // Keep browsing continuous for sort/filter changes; only reset for catalogue navigation.
  useLayoutEffect(() => {
    if (skipNavScrollRef.current) return;
    scrollToTop();
  }, [pathKey]);

  useLayoutEffect(() => {
    skipNavScrollRef.current = false;
  });

  const handlePageChange = useCallback((nextPage) => {
    scrollToTop();
    setPage(nextPage);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setActiveCollection('all');
    setSort(DEFAULT_SORT);
    setInStockOnly(false);
    setPage(1);
    if (Object.keys(refinements).length > 0) {
      hashNavigate(path, {});
    }
    try {
      sessionStorage.removeItem(IN_STOCK_ONLY_KEY);
      sessionStorage.setItem(CATALOG_SORT_KEY, DEFAULT_SORT);
    } catch { /* ignore */ }
  }, [hashNavigate, path, refinements]);

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
    return subscribeCatalogRefresh(() => setCatalogRefreshKey((k) => k + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cancelDeferredImageWarm = null;

    const warmPageImages = (products) => {
      const imageUrls = products
        .map((product) => product.image || product.localImage)
        .filter(Boolean);
      if (!imageUrls.length) return;

      // Prioritize the first visible rows, then warm the rest off the critical path.
      const immediateLimit = page === 1 ? 12 : 20;
      preloadProductImages(imageUrls, { limit: immediateLimit });

      const deferredUrls = imageUrls.slice(immediateLimit);
      if (!deferredUrls.length || typeof window === 'undefined') return;

      const runDeferredWarm = () => {
        if (cancelled) return;
        preloadProductImages(deferredUrls, { limit: deferredUrls.length });
      };

      if (typeof window.requestIdleCallback === 'function') {
        const idleId = window.requestIdleCallback(runDeferredWarm, { timeout: 1200 });
        cancelDeferredImageWarm = () => {
          if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
        };
        return;
      }

      const timerId = window.setTimeout(runDeferredWarm, 250);
      cancelDeferredImageWarm = () => window.clearTimeout(timerId);
    };

    const load = async () => {
      setLoading(true);
      let allowCountsUpdate = true;
      try {
        const specialIds = activeCollection === 'specials' ? new Set(Object.keys(specialsMap)) : null;
        const countsPromise = fetchCategoryCounts({ collection: activeCollection, inStockOnly })
          .then((nextCounts) => {
            if (cancelled || !allowCountsUpdate) return;
            setCounts(nextCounts);
          })
          .catch(() => {});

        const pageData = await fetchProductPage({
          page,
          pageSize: CATALOG_PAGE_SIZE,
          searchQuery,
          categoryPath: path,
          collection: activeCollection,
          sort,
          specialIds,
          inStockOnly,
        });

        if (cancelled) return;
        setUsingFallback(false);

        if (pageData.total > 0 && pageData.products.length === 0 && page > 1) {
          const maxPage = Math.max(1, Math.ceil(pageData.total / CATALOG_PAGE_SIZE));
          if (maxPage !== page) {
            setPage(maxPage);
            return;
          }
        }

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
            inStockOnly,
          });
          if (!cancelled && l1Data.total > 0) {
            setCatalogProducts(l1Data.products);
            setCatalogTotal(l1Data.total);
            warmPageImages(l1Data.products);
            return;
          }
        }

        setCatalogProducts(pageData.products);
        setCatalogTotal(pageData.total);
        warmPageImages(pageData.products);
        void countsPromise;
      } catch {
        // If primary catalogue load fails, keep fallback counts source authoritative.
        // This avoids a late async counts write racing over fallback UI state.
        allowCountsUpdate = false;
        // products.json is regenerated on every deploy; stockProducts.json was a frozen stale snapshot.
        const response = await fetch('/products.json');
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
        if (inStockOnly) rows = rows.filter(isProductAvailable);
        rows = sortCatalogProducts(rows, sort, { hasSearch });
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
      if (cancelDeferredImageWarm) cancelDeferredImageWarm();
    };
  }, [activeCollection, page, path, searchQuery, sort, categories, inStockOnly, catalogRefreshKey]);

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

  const markCartActivity = useCallback(() => {
    const now = Date.now();
    setCartLastActivityAt(now);
    setCartClock(now);
    try { localStorage.setItem(CART_LAST_ACTIVITY_KEY, String(now)); } catch { /* ignore */ }
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setCartLastActivityAt(null);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(CART_LAST_ACTIVITY_KEY);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!cartItems.length || !cartLastActivityAt) return;
    if (cartClock - cartLastActivityAt < CART_INACTIVITY_WINDOW_MS) return;
    clearCart();
    setDrawerPeek(false);
  }, [cartItems.length, cartLastActivityAt, cartClock, clearCart]);

  const addToCart = (product, qty, buttonPos = null) => {
    const maxQty = cartQtyCapForProduct(product);
    if (maxQty <= 0) return;
    const requestedQty = normalizeCartQtyInput(qty);

    dismissWelcome();
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(maxQty, existing.qty + requestedQty);
        if (nextQty === existing.qty) return prev;
        return prev.map((i) => (i.product.id === product.id ? { ...i, qty: nextQty } : i));
      }
      return [...prev, { product, qty: Math.min(maxQty, requestedQty) }];
    });
    markCartActivity();

    if (searchTrackRef.current.rowId && searchQuery.trim()) {
      void logSearchCartAdd(searchTrackRef.current.rowId);
    }

    if (buttonPos) setFlyAnim(buttonPos);

    setDrawerPeek(true);
    if (drawerTimerRef.current) clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = setTimeout(() => setDrawerPeek(false), DRAWER_PEEK_MS);
  };

  const updateQty = (id, qty) => {
    const requestedQty = normalizeCartQtyInput(qty);
    setCartItems((prev) => prev.flatMap((item) => {
      if (item.product.id !== id) return [item];
      const maxQty = cartQtyCapForProduct(item.product);
      if (maxQty <= 0) return [];
      const nextQty = Math.max(1, Math.min(maxQty, requestedQty));
      return [{ ...item, qty: nextQty }];
    }));
    markCartActivity();
  };
  const removeFromCart = (id) => {
    setCartItems((prev) => prev.filter((i) => i.product.id !== id));
    markCartActivity();
  };

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
  const cartExpiryRemainingMs = cartItems.length && cartLastActivityAt
    ? Math.max(0, cartLastActivityAt + CART_INACTIVITY_WINDOW_MS - cartClock)
    : null;
  const cartExpiryProgress = cartExpiryRemainingMs === null
    ? 0
    : Math.min(100, Math.max(0, ((CART_INACTIVITY_WINDOW_MS - cartExpiryRemainingMs) / CART_INACTIVITY_WINDOW_MS) * 100));
  const cartExpiryTone = cartExpiryRemainingMs === null
    ? 'ok'
    : cartExpiryRemainingMs <= CART_EXPIRY_DANGER_MS
      ? 'danger'
      : cartExpiryRemainingMs <= CART_EXPIRY_WARN_MS
        ? 'warn'
        : 'ok';

  const sendOrderEmail = async (opts = {}) => {
    if (!cartItems.length) return;
    const courierChoice = opts?.courierChoice || null;
    const customerNotes = String(opts?.customerNotes || '').trim();
    const promo = opts?.promo || null;
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
    const text = buildOrderText(cartItems, cartTotal, promo);
    setOrderText(text);
    setOrderStatus('sending');
    setOrderError('');
    setModalOpen(true);

    try {
      let savedOrder = null;
      if (customer?.id) {
        savedOrder = await saveOrder(customer.id, cartItems, cartTotal, {
          deliveryMethod,
          customerNotes,
          promoCode: promo?.code || null,
          discountPct: promo?.discountPct ?? null,
          discountAmount: promo?.discountAmount ?? null,
        });
        fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
      }

      const payload = {
        customer: customerDetails,
        totals: {
          subtotal: cartTotal,
          discountAmount: promo?.discountAmount || 0,
          total: promo?.total ?? cartTotal,
        },
        promoCode: promo?.code || null,
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
    markCartActivity();

    setReorderModal(false);
  };

  const [previewProduct, setPreviewProduct] = useState(null);

  const handleProductPreview = useCallback((product) => {
    dismissWelcome();
    setPreviewProduct(product);
  }, [dismissWelcome]);

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
        onHome={goHome}
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
            onAllProducts={goAllProducts}
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
            setSort={handleSortChange}
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
            onProductPreview={handleProductPreview}
            showWelcome={showWelcome}
            inStockOnly={inStockOnly}
            onInStockOnlyChange={handleInStockOnlyChange}
            searchActive={Boolean(searchQuery.trim())}
            onSearchProductClick={handleSearchProductClick}
            onResetFilters={handleResetFilters}
            refinements={refinements}
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
            customer={customer}
            autoCloseProgress={cartExpiryProgress}
            showAutoCloseBar={cartExpiryRemainingMs !== null}
            cartExpiryRemainingMs={cartExpiryRemainingMs}
            cartExpiryTone={cartExpiryTone}
            onClose={() => setCartDrawerOpen(false)}
          />
        </aside>
      </div>

      <Suspense fallback={null}>
        <OrderConfirmModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          orderStatus={orderStatus}
          orderError={orderError}
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
        onHome={() => { goHome(); setMobileMenuOpen(false); }}
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
                customer={customer}
                autoCloseProgress={cartExpiryProgress}
                showAutoCloseBar={cartExpiryRemainingMs !== null}
                cartExpiryRemainingMs={cartExpiryRemainingMs}
                cartExpiryTone={cartExpiryTone}
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

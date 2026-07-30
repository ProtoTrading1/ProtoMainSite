import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import MobileNav from './components/MobileNav';
import Drawer from './components/Drawer';
import ProductCard from './components/ProductCard';
import CartFlyAnimation from './components/CartFlyAnimation';

import lazyWithRetry from './lib/lazyWithRetry';

// Lazy-loaded: only fetched when the user actually triggers these interactions.
const OrderConfirmModal = lazyWithRetry(() => import('./components/OrderConfirmModal'), 'app-order-confirm-modal');
const ReorderModal = lazyWithRetry(() => import('./components/ReorderModal'), 'app-reorder-modal');
import { useHashNav, buildBreadcrumb } from './hooks/useHashNav';
import { fetchCategoryCounts, fetchDistinctCategories, fetchProductPage, fetchProductsBySkus, isProductAvailable, sortCatalogProducts, DEFAULT_SORT, normalizeCatalogSort, subscribeCatalogRefresh } from './lib/products';
import { preloadProductImages } from './lib/imageUrl';
import { groupProductsByBarcode } from './lib/productGroups';
import { fuzzyFilter } from './lib/fuzzySearch';
import { fetchLastOrder, makeClientRef } from './lib/orders';
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

const CATALOG_PAGE_SIZE = 60;
// Mirrors MAX_ORDER_LINES in api/send-order.js — the server rejects an order
// with more lines than this, so the cart must not be allowed to exceed it.
const MAX_CART_LINES = 250;
// Keep the add-to-cart confirmation brief so it does not cover the catalogue,
// but never retreat while the customer is inspecting or editing the basket.
const DRAWER_PEEK_MS = 700;
const WELCOME_DISPLAY_MS = 2000;
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
  // Featured should be the consistent default on every visit/reload.
  return DEFAULT_SORT;
}

function hashHasCategoryPath() {
  if (typeof window === 'undefined') return false;
  const raw = window.location.hash.replace(/^#\/?/, '');
  const pathStr = (raw.split('?')[0] || '').trim();
  if (!pathStr) return false;
  const segments = pathStr.split('/').filter(Boolean);
  return segments.length > 0;
}

function readInitialShowWelcome() {
  try {
    if (sessionStorage.getItem(WELCOME_DISMISSED_KEY)) return false;
  } catch { /* ignore */ }
  return !hashHasCategoryPath();
}

function productStockQtyForCart(product) {
  const qtyRaw = product?.stockOnHand ?? product?.stockQty ?? product?.available_stock ?? product?.stock_qty;
  if (qtyRaw === undefined || qtyRaw === null || qtyRaw === '') return null;
  const qty = Number(qtyRaw);
  return Number.isFinite(qty) ? qty : null;
}

function productCanOrderWhenOos(product) {
  // Only "to order" products are orderable at zero stock — keep_live_when_oos
  // alone keeps a product visible but shown as out-of-stock (not orderable).
  return product?.toOrder === true
    || product?.to_order === true
    || product?.orderableWhenOutOfStock === true
    || product?.orderable_when_out_of_stock === true;
}

function cartQtyCapForProduct(product) {
  if (!product) return 0;
  if (productCanOrderWhenOos(product)) return CART_QTY_UNLIMITED;

  const qty = productStockQtyForCart(product);
  if (qty === null) return product.inStock === false ? 0 : CART_QTY_UNLIMITED;
  // Zero stock (non-"to order") is not orderable. Everything else may be
  // over-ordered as a backorder request — we no longer silently clamp an
  // in-stock line to available stock; instead a clear advisory is shown at the
  // quantity inputs (see src/lib/stockAdvisory.js). Negative SOH lines are
  // valid backorders and likewise uncapped.
  if (qty === 0) return 0;
  return CART_QTY_UNLIMITED;
}

function normalizeCartQtyInput(qty) {
  const numeric = Number(qty);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.floor(numeric));
}

function collectionLabel(collection) {
  if (collection === 'hot') return 'Hot Sellers';
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
  // `searchQuery` is the COMMITTED search term. The Header keeps the live input
  // value locally and only pushes here after a short debounce, so typing never
  // re-renders this component (and the whole product grid) per keystroke — that
  // was the "typing is extremely slow" cause.
  const [searchQuery, setSearchQuery] = useState('');
  const [showWelcome, setShowWelcome] = useState(readInitialShowWelcome);
  const [inStockOnly, setInStockOnly] = useState(readInStockOnly);

  const dismissWelcome = useCallback(() => {
    setShowWelcome((prev) => {
      if (!prev) return prev;
      try { sessionStorage.setItem(WELCOME_DISMISSED_KEY, '1'); } catch { /* ignore */ }
      return false;
    });
  }, []);

  useEffect(() => {
    if (!showWelcome) return undefined;
    const dismissTimer = window.setTimeout(dismissWelcome, WELCOME_DISPLAY_MS);
    const dismissOnScroll = () => dismissWelcome();
    window.addEventListener('scroll', dismissOnScroll, { passive: true, once: true });
    return () => {
      window.clearTimeout(dismissTimer);
      window.removeEventListener('scroll', dismissOnScroll);
    };
  }, [dismissWelcome, showWelcome]);

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
    hashNavigate(newPath, newRefinements, { scroll: true });
  }, [hashNavigate]);

  const goAllProducts = useCallback(() => {
    dismissWelcome();
    navigate([]);
  }, [dismissWelcome, navigate]);

  const navigateForSearch = useCallback((newPath, newRefinements) => {
    hashNavigate(newPath, newRefinements, { scroll: true });
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
  const [cartAnnouncement, setCartAnnouncement] = useState('');
  const [cartLastActivityAt, setCartLastActivityAt] = useState(readCartActivityAt);
  const [cartClock, setCartClock] = useState(Date.now());
  const [flyAnim, setFlyAnim] = useState(null);
  const [drawerPeek, setDrawerPeek] = useState(false);
  const drawerTimerRef = useRef(null);
  const cartTriggerRef = useRef(null);
  const desktopCartRef = useRef(null);
  const mobileCartDialogRef = useRef(null);
  const searchTrackRef = useRef({ rowId: null, searchedAt: null, term: '' });
  const lastSearchLogKeyRef = useRef('');
  const hasInitializedCartAnnouncementRef = useRef(false);
  const prevCartSnapshotRef = useRef({ count: 0, total: 0 });
  // Idempotency key for the CURRENT cart's checkout. Persists across retries of
  // the same cart (so a resubmit after an email/network error recovers the
  // existing order instead of double-inserting) and resets when the cart
  // changes (a genuinely different order) or after a successful submit clears it.
  const checkoutRefRef = useRef(null);
  useEffect(() => { checkoutRefRef.current = null; }, [cartItems]);
  const [activeCollection, setActiveCollection] = useState('all');
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [reorderModal, setReorderModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [browseCategories, setBrowseCategories] = useState([]);
  const [specialsMap, setSpecialsMap] = useState({});
  const [bannerConfig, setBannerConfig] = useState(null);
  const [popupConfig, setPopupConfig] = useState(null);
  const [showPopup, setShowPopup] = useState(false);

  const restoreCartTriggerFocus = useCallback(() => {
    const trigger = cartTriggerRef.current;
    cartTriggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  }, []);

  const closeDesktopCart = useCallback(({ restoreFocus = true } = {}) => {
    setCartDrawerOpen(false);
    setDrawerPeek(false);
    if (drawerTimerRef.current) clearTimeout(drawerTimerRef.current);
    if (restoreFocus) restoreCartTriggerFocus();
  }, [restoreCartTriggerFocus]);

  const pauseDrawerPeek = useCallback(() => {
    if (!drawerPeek || cartDrawerOpen) return;
    if (drawerTimerRef.current) {
      window.clearTimeout(drawerTimerRef.current);
      drawerTimerRef.current = null;
    }
  }, [cartDrawerOpen, drawerPeek]);

  const resumeDrawerPeek = useCallback(() => {
    if (!drawerPeek || cartDrawerOpen) return;
    if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = window.setTimeout(() => {
      setDrawerPeek(false);
      drawerTimerRef.current = null;
    }, DRAWER_PEEK_MS);
  }, [cartDrawerOpen, drawerPeek]);

  const closeMobileCart = useCallback(({ restoreFocus = true } = {}) => {
    setMobileCartOpen(false);
    if (restoreFocus) restoreCartTriggerFocus();
  }, [restoreCartTriggerFocus]);

  const handleCartOpen = useCallback((event) => {
    cartTriggerRef.current = event?.currentTarget || document.activeElement;
    if (window.innerWidth > 1200) setCartDrawerOpen(true);
    else setMobileCartOpen(true);
  }, []);

  const goHome = useCallback(() => {
    try { sessionStorage.removeItem(IN_STOCK_ONLY_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(CATALOG_SORT_KEY); } catch { /* ignore */ }
    setSearchQuery('');
    setActiveCollection('all');
    setSort(DEFAULT_SORT);
    setInStockOnly(false);
    hashNavigate([], {}, { scroll: false });
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
    if (!mobileCartOpen) return undefined;
    const dialog = mobileCartDialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    const focusFrame = window.requestAnimationFrame(() => dialog?.querySelector('[data-cart-close]')?.focus());
    const onGlobalEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMobileCart();
    };
    const onTrapFocus = (event) => {
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onGlobalEscape);
    document.addEventListener('keydown', onTrapFocus);
    return () => {
      document.removeEventListener('keydown', onGlobalEscape);
      document.removeEventListener('keydown', onTrapFocus);
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [mobileCartOpen, closeMobileCart]);

  useEffect(() => {
    if (!cartDrawerOpen) return undefined;
    window.requestAnimationFrame(() => desktopCartRef.current?.querySelector('[data-cart-close]')?.focus());
    const onGlobalEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeDesktopCart();
    };
    document.addEventListener('keydown', onGlobalEscape);
    return () => document.removeEventListener('keydown', onGlobalEscape);
  }, [cartDrawerOpen, closeDesktopCart]);

  useEffect(() => {
    setPage(1);
  }, [path.join('/')]);

  useEffect(() => {
    // Collection switches represent a new catalogue scope — restart pagination.
    setPage(1);
  }, [activeCollection]);

  // Graceful fallback for legacy/unknown category slugs (taxonomy changed):
  // if the first path segment isn't a known department, resolve to the
  // catalogue root instead of showing an empty/broken page.
  useEffect(() => {
    if (path.length && !categories.some((c) => c.id === path[0])) {
      hashNavigate([]);
    }
  }, [path, hashNavigate]);

  const pathKey = path.join('/');

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
      hashNavigate(path, {}, { scroll: false });
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

  // Category counts describe the catalogue scope, not the current browse
  // position. Keeping them in the page-loading effect made every department,
  // category, page, search and sort change repeat the full taxonomy count pass.
  // Refresh only when an input that can actually change a count changes.
  useEffect(() => {
    let cancelled = false;
    void fetchCategoryCounts({ collection: activeCollection, inStockOnly })
      .then((nextCounts) => {
        if (!cancelled) setCounts(nextCounts);
      })
      .catch(() => {
        // Counts are supporting navigation data. A transient count failure must
        // not clear otherwise valid counts or block the product page.
      });
    return () => { cancelled = true; };
  }, [activeCollection, categories, inStockOnly, catalogRefreshKey]);

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
      try {
        const specialIds = activeCollection === 'specials' ? new Set(Object.keys(specialsMap)) : null;
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
      } catch {
        // Never fall back to a public catalogue file: trade pricing and stock
        // are available only through the approved-customer API.
        if (cancelled) return;
        setUsingFallback(false);
        setCatalogTotal(0);
        setCatalogProducts([]);
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
  const [orderStatus, setOrderStatus] = useState('idle');
  const [orderError, setOrderError] = useState('');
  const [submittedOrderNumber, setSubmittedOrderNumber] = useState('');

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

  const addToCart = useCallback((product, qty, buttonPos = null) => {
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
    drawerTimerRef.current = setTimeout(() => {
      setDrawerPeek(false);
      drawerTimerRef.current = null;
    }, DRAWER_PEEK_MS);
  }, [dismissWelcome, markCartActivity, searchQuery]);

  const updateQty = useCallback((id, qty) => {
    const requestedQty = normalizeCartQtyInput(qty);
    setCartItems((prev) => prev.flatMap((item) => {
      if (item.product.id !== id) return [item];
      const maxQty = cartQtyCapForProduct(item.product);
      if (maxQty <= 0) return [];
      const nextQty = Math.max(1, Math.min(maxQty, requestedQty));
      return [{ ...item, qty: nextQty }];
    }));
    markCartActivity();
  }, [markCartActivity]);

  const removeFromCart = useCallback((id) => {
    setCartItems((prev) => prev.filter((i) => i.product.id !== id));
    markCartActivity();
  }, [markCartActivity]);

  const cartQtyMap = useMemo(() => {
    const map = {};
    for (const item of cartItems) map[item.product.id] = item.qty;
    return map;
  }, [cartItems]);

  const handleCartQtyChange = useCallback((product, newQty) => {
    if (newQty <= 0) removeFromCart(product.id);
    else updateQty(product.id, newQty);
  }, [removeFromCart, updateQty]);

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

  useEffect(() => {
    const prev = prevCartSnapshotRef.current;
    const next = { count: totalItemCount, total: cartTotal };

    if (!hasInitializedCartAnnouncementRef.current) {
      hasInitializedCartAnnouncementRef.current = true;
      prevCartSnapshotRef.current = next;
      return;
    }
    if (prev.count === next.count && prev.total === next.total) return;

    if (next.count === 0) {
      setCartAnnouncement('Cart cleared.');
    } else {
      setCartAnnouncement(`Cart updated. ${next.count} item${next.count === 1 ? '' : 's'}. Total R${next.total.toFixed(2)}.`);
    }
    prevCartSnapshotRef.current = next;
  }, [totalItemCount, cartTotal]);

  const sendOrderEmail = async (opts = {}) => {
    if (!cartItems.length) return;
    const courierChoice = opts?.courierChoice || null;
    const customerNotes = String(opts?.customerNotes || '').trim();
    const promo = opts?.promo || null;
    const deliveryMethod = courierChoice === 'own'
      ? "Customer's own courier"
      : courierChoice === 'proto'
        ? 'Proto Trading delivers'
        : courierChoice === 'pickup'
          ? 'In store pick up'
          : null;

    if (!deliveryMethod) {
      setOrderError('Please choose a delivery option before submitting.');
      setOrderStatus('error');
      setModalOpen(true);
      return;
    }

    setOrderStatus('sending');
    setOrderError('');
    setSubmittedOrderNumber('');
    setModalOpen(true);

    try {
      // Idempotency key for this checkout: generated once per cart and reused
      // across retries, so a human "try again" after an error recovers the
      // customer's existing server-side order rather than inserting a duplicate.
      if (!checkoutRefRef.current) checkoutRefRef.current = makeClientRef();
      const clientRef = checkoutRefRef.current;

      const payload = {
        clientRef,
        promoCode: promo?.code || null,
        deliveryMethod,
        customerNotes,
        items: cartItems.map((item) => ({
          qty: item.qty,
          product: {
            id: item.product.id,
            sku: item.product.sku,
            code: item.product.code,
            name: item.product.name,
          },
        })),
      };

      // The secure API resolves the signed-in customer and every product price
      // from server-side data, then saves the order before confirming success.
      const sendHeaders = await authHeaders();
      const body = JSON.stringify(payload);
      const submitOrder = () => fetch('/api/send-order', {
        method: 'POST',
        headers: sendHeaders,
        body,
      }).then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Order could not be sent');
        return result;
      });

      const logConversion = (result) => {
        if (searchTrackRef.current.rowId) {
          void logSearchOrder({
            searchRowId: searchTrackRef.current.rowId,
            orderNumber: result?.orderId || '',
            orderValue: cartTotal,
          });
        }
      };

      const result = await submitOrder();
      setSubmittedOrderNumber(result.orderNumber || '');
      setOrderStatus(result.emailDeliveryFailed ? 'saved' : 'sent');
      clearCart();
      setMobileCartOpen(false);
      setCartDrawerOpen(false);
      logConversion(result);
      if (customer?.id) fetchLastOrder(customer.id).then(setLastOrder).catch(() => {});
    } catch (err) {
      setOrderStatus('error');
      setOrderError(err.message || 'Order could not be sent');
    }
  };

  const handleReorder = async (items) => {
    // Look products up by SKU through the API, NOT in catalogProducts — that is
    // only the current 60-product page, narrowed further by the active
    // category/search/in-stock filter. Matching against it meant a large
    // reorder silently added whatever happened to be on screen and dropped the
    // rest: a 160-line order added a handful of items with no error shown.
    const bySku = await fetchProductsBySkus(items.map((item) => item.productId || item.code));

    const resolved = [];
    const missing = [];
    for (const item of items) {
      const product = bySku.get(String(item.productId || '').toUpperCase())
        || bySku.get(String(item.code || '').toUpperCase())
        || catalogProducts.find((p) => p.id === item.productId || p.code === item.code);
      if (product) resolved.push({ product, qty: item.qty });
      else missing.push(item);
    }

    // Build the next cart OUTSIDE the state updater. Deriving the counts inside
    // it would be unreliable — React may run the updater later, or twice in
    // StrictMode, so `added`/`overflow` could be wrong or double-counted in the
    // message shown to the customer.
    const nextCart = cartItems.map((entry) => ({ ...entry }));
    let added = 0;
    let overflow = 0;
    for (const item of resolved) {
      const existing = nextCart.find((entry) => entry.product.id === item.product.id);
      if (existing) { existing.qty += item.qty; added += 1; continue; }
      // The server rejects an order over MAX_CART_LINES lines. Stopping here
      // beats letting the cart grow past the limit and failing at checkout,
      // after the customer has already spent the effort.
      if (nextCart.length >= MAX_CART_LINES) { overflow += 1; continue; }
      nextCart.push(item);
      added += 1;
    }

    if (added) {
      setCartItems(nextCart);
      markCartActivity();
    }

    // The modal stays open when something could not be added, so the customer
    // sees which lines are no longer available rather than assuming the whole
    // order went back in the cart.
    if (!missing.length && !overflow) setReorderModal(false);
    return { added, missing, overflow };
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

  const totalPages = Math.max(1, Math.ceil(catalogTotal / CATALOG_PAGE_SIZE));
  const desktopDrawerVisible = cartDrawerOpen || drawerPeek;

  return (
    <div className="app-root" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{cartAnnouncement}</p>
      <Header
        cartItemCount={totalItemCount}
        cartTotal={cartTotal}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        navigateForSearch={navigateForSearch}
        onMenuClick={() => { dismissWelcome(); setMobileMenuOpen(true); }}
        onHome={goHome}
        customer={customer}
        onViewProfile={onViewProfile}
        onViewAdmin={onViewAdmin}
        onReorder={() => setReorderModal(true)}
        hasLastOrder={!!lastOrder}
        previousOrderItems={lastOrder?.items || []}
        onLogout={onLogout}
        onSpecials={() => handleShortcut('specials')}
        onSearchAddToCart={(product, qty) => addToCart(product, qty)}
        onCartClick={handleCartOpen}
      />

      <div className="main-layout" style={{ flex: 1, minHeight: 0 }}>
        <aside className="sidebar-rail" onMouseEnter={dismissWelcome}>
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

        <main className="content-area" onScroll={dismissWelcome}>
          <MainContent
            products={catalogProducts}
            resultsTotal={catalogTotal}
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

        <aside
          ref={desktopCartRef}
          className={`cart-drawer${cartDrawerOpen ? ' open' : drawerPeek ? ' peek' : ''}`}
          aria-hidden={!desktopDrawerVisible}
          onMouseEnter={pauseDrawerPeek}
          onMouseLeave={resumeDrawerPeek}
        >
          {desktopDrawerVisible && <Drawer
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
            onClose={() => closeDesktopCart({ restoreFocus: cartDrawerOpen })}
            onContinueShopping={() => closeDesktopCart({ restoreFocus: true })}
          />}
        </aside>
      </div>

      <Suspense fallback={null}>
        <OrderConfirmModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          orderStatus={orderStatus}
          orderError={orderError}
          orderNumber={submittedOrderNumber}
        />
      </Suspense>

      {reorderModal && <Suspense fallback={null}><ReorderModal lastOrder={lastOrder} onReorder={handleReorder} onClose={() => setReorderModal(false)} /></Suspense>}

      {flyAnim && <CartFlyAnimation from={flyAnim} onDone={() => setFlyAnim(null)} />}

      {/* Global product preview — triggered from strip cards in category landings */}
      {previewProduct && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px' }}>
          <ProductCard
            product={previewProduct}
            addToCart={addToCart}
            cartQty={cartQtyMap[previewProduct.id] || 0}
            onCartQtyChange={handleCartQtyChange}
            special={specialsMap[previewProduct.id] || (previewProduct.isNew ? { deal: 'none' } : null)}
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
        <div className="mobile-cart-backdrop" onClick={() => closeMobileCart()}>
          <div
            ref={mobileCartDialogRef}
            className="mobile-cart-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-cart-sheet-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-cart-sheet-handle" />
            <div className="mobile-cart-sheet-header">
              <span className="mobile-cart-sheet-title" id="mobile-cart-sheet-title">Your Order</span>
              <button
                type="button"
                className="mobile-cart-sheet-close"
                onClick={() => closeMobileCart()}
                aria-label="Close cart"
                data-cart-close
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
                sendOrderEmail={(opts) => { closeMobileCart({ restoreFocus: false }); sendOrderEmail(opts); }}
                customer={customer}
                autoCloseProgress={cartExpiryProgress}
                showAutoCloseBar={cartExpiryRemainingMs !== null}
                cartExpiryRemainingMs={cartExpiryRemainingMs}
                cartExpiryTone={cartExpiryTone}
                onContinueShopping={() => setMobileCartOpen(false)}
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

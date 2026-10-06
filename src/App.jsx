import usePersonalisedArrivals from './hooks/usePersonalisedArrivals';
import PersonalisedArrivalTip from './components/PersonalisedArrivalTip';
import { trackShoppingEvent, trackShoppingSearch, trackShoppingProduct, basketQuantityChanges, clearShoppingSearch, trackCatalogueVisit, shoppingSource } from './lib/shoppingAnalytics';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { X } from 'lucide-react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { requestJson, withDeadline } from './lib/requestDeadline.mjs';
import { checkSavedCheckout, savedCheckoutSummary } from './lib/checkoutRecoveryClient.mjs';
import { readPendingCheckout, submittedBasketStillCurrent, writePendingCheckout, withPendingCheckoutLock, verifyPendingCheckout, recordPendingCheckoutDispatch, recordPendingCheckoutReview, acceptPendingCheckout, finishPendingCheckout } from './lib/pendingCheckout.mjs';
import MobileNav from './components/MobileNav';
import ExtendedRangePage from './components/ExtendedRangePage';
import { instoreAvailable } from './lib/instoreAvailability';
import { fetchExtendedRange, fetchInstoreProductsBySkus, instoreCatalogue } from './lib/extendedRange';
import { instorePage } from '../lib/instore-page.mjs';
import Drawer from './components/Drawer';
import ProductCard from './components/ProductCard';
import CartFlyAnimation from './components/CartFlyAnimation';
import CustomerJourneyPrompt from './components/CustomerJourneyPrompt';
import useSearchTip from './hooks/useSearchTip';

import lazyWithRetry from './lib/lazyWithRetry';

// Lazy-loaded: only fetched when the user actually triggers these interactions.
const OrderConfirmModal = lazyWithRetry(() => import('./components/OrderConfirmModal'), 'app-order-confirm-modal');
const ReorderModal = lazyWithRetry(() => import('./components/ReorderModal'), 'app-reorder-modal');
import { useHashNav, buildBreadcrumb } from './hooks/useHashNav';
import { instorePageFromRefinements, instorePageRefinements, instoreSearchQueryFromRefinements, instoreSearchRefinements, instoreSearchRoute } from './lib/instoreSearchRoute';
import { catalogueSearchQueryFromRoute, catalogueSearchRoute } from './lib/catalogueSearchRoute';
import { fetchCategoryCounts, fetchDistinctCategories, fetchProductPage, fetchProductsBySkus, DEFAULT_SORT, normalizeCatalogSort, refreshProductCache, subscribeCatalogRefresh } from './lib/products';
import { catalogueResultsForQuery } from './lib/catalogueResultQuery.js';
import { preloadProductImages } from './lib/imageUrl';
import { fetchLastOrder, makeClientRef } from './lib/orders';
import { fetchSpecials, buildSpecialsMap } from './lib/specials';
import { fetchBanner, invalidateBannerCache } from './lib/banner';
import { fetchPopupSpecial, shouldShowPopup, dismissPopup } from './lib/popupSpecial';
import PopupSpecialModal from './components/PopupSpecialModal';
import { authHeaders, captureAuthIdentity, assertAuthIdentity } from './lib/authHeaders';
import { trackEvent } from './lib/trackEvent';
import { logSearch, logSearchClick, logSearchCartAdd, logSearchOrder } from './lib/searchAnalytics';
import { useLiveTaxonomy } from './lib/useLiveTaxonomy';
import { scrollToTop, scrollToTopSmooth } from './lib/scrollToTop';
import { cartFingerprint, clearAccountCart, getAccountCart, mergeAccountCart, saveAccountCart } from './lib/accountCart';
import { CART_PRODUCT_REVIEW_MESSAGE, cartProductsNeedReview, freshCartProduct, knownCartProductSource, recoverCartProducts, verifiedReorderProduct } from './lib/cartProductRecovery.mjs';
import { cartSyncFailure } from './lib/cartSyncRecovery.mjs';
import { readPendingCart, clearPendingCart, writeRecoverablePendingCart, readPendingCartRecoveryCopies, acknowledgePendingCartRecoveryCopies, retireSupersededPendingCartRecoveryCopy } from './lib/cartSyncJournal.mjs';
import { readLegacyCartCopy, preserveLegacyCartCopy, discardLegacyCartCopy } from './lib/legacyCartCopy.mjs';
import { browserCartStorage as localStorage, readStoredCart, archiveUnreadableCart } from './lib/cartStorage.mjs';
import { itemPreferenceFields, normalizeItemPreference } from '../lib/item-preference.mjs';
import { addBasketLine, basketLineKey, basketProductKey, mergeBasketLines, removeBasketLine, updateBasketLineQuantity } from '../lib/basket-lines.mjs';
import { detectCartPriceChanges } from './lib/cartPriceChanges';
import { trackJourneyEvent } from './lib/journeyAnalytics';
import { startPresenceHeartbeat } from './lib/presence';
import { productDetailId } from './lib/productDetailUrl';
import { selectCustomerDashboardState } from './lib/customerDashboardState';
import { markPortalWelcomeSeen } from './lib/auth';
import { checkoutSnapshotForProduct, isToOrderProduct, normaliseStockQty } from '../lib/order-stock-guard.mjs';
import './index.css';

const CATALOG_PAGE_SIZE = 60;
// Mirrors MAX_ORDER_LINES in api/send-order.js — the server rejects an order
// with more lines than this, so the cart must not be allowed to exceed it.
const MAX_CART_LINES = 250;
// Keep the add-to-cart confirmation brief so it does not cover the catalogue,
// but never retreat while the customer is inspecting or editing the basket.
// Includes the short slide-in transition. This leaves the completed basket
// preview visible for about one second: quick enough not to interrupt ordering,
// but long enough to notice it and move the pointer over it.
const DRAWER_PEEK_MS = 1200;
const IN_STOCK_ONLY_KEY = 'proto_in_stock_only';
const CATALOG_SORT_KEY = 'proto_catalog_sort';
const CART_STORAGE_KEY = 'proto_cart';
const CART_OWNER_KEY = 'proto_cart_owner';
const CART_LAST_ACTIVITY_KEY = 'proto_cart_last_activity_at';
const CART_INACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CART_EXPIRY_WARN_MS = 7 * 24 * 60 * 60 * 1000;
const CART_EXPIRY_DANGER_MS = 24 * 60 * 60 * 1000;
const CART_QTY_UNLIMITED = 9999;
const CUSTOMER_JOURNEY_SESSION_KEY_PREFIX = 'proto_customer_journey_session_v1';
const BASKET_REMINDER_SCROLL_DISMISS_PX = 96;
const CUSTOMER_JOURNEY_EXIT_MS = 180;

function customerFirstName(customer) {
  const candidate = customer?.first_name
    || customer?.contact_name
    || customer?.name
    || String(customer?.email || '').split('@')[0];
  return String(candidate || '').trim().split(/\s+/)[0] || 'there';
}

function customerJourneySessionKey(customerId, loginSessionKey) {
  if (!customerId || !loginSessionKey) return null;
  return `${CUSTOMER_JOURNEY_SESSION_KEY_PREFIX}:${customerId}:${loginSessionKey}`;
}

function hasShownJourneyThisLogin(customerId, loginSessionKey) {
  const key = customerJourneySessionKey(customerId, loginSessionKey);
  if (!key) return false;
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function rememberJourneyThisLogin(customerId, loginSessionKey) {
  const key = customerJourneySessionKey(customerId, loginSessionKey);
  if (!key) return;
  try {
    sessionStorage.setItem(key, '1');
  } catch { /* the in-memory guard still prevents repeats during this mount */ }
}

function isExplicitFirstPortalLogin(customer) {
  return Boolean(customer)
    && Object.prototype.hasOwnProperty.call(customer, 'portal_welcome_seen_at')
    && customer.portal_welcome_seen_at === null;
}

function readPendingBytes(accountId) {
  try { return localStorage.getItem(`proto_cart_pending_${accountId}`); } catch { return null; }
}

function assertPendingSnapshot(accountId, expectedRaw) {
  if (readPendingBytes(accountId) === expectedRaw) return;
  const error = new Error('Another tab changed the pending basket during recovery');
  error.status = 409;
  throw error;
}

function readCartActivityAt() {
  try {
    const raw = Number(localStorage.getItem(CART_LAST_ACTIVITY_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

function readInStockOnly() {
  // Unavailable products stay discoverable and are visually disabled instead
  // of disappearing. Clear the retired preference for returning customers.
  try { sessionStorage.removeItem(IN_STOCK_ONLY_KEY); } catch { /* ignore */ }
  return false;
}

function readInitialSort() {
  // Featured should be the consistent default on every visit/reload.
  return DEFAULT_SORT;
}

function productStockQtyForCart(product) {
  const qtyRaw = product?.stockOnHand ?? product?.stockQty ?? product?.available_stock ?? product?.stock_qty;
  if (qtyRaw === undefined || qtyRaw === null || qtyRaw === '') return null;
  const qty = Number(qtyRaw);
  return Number.isFinite(qty) ? qty : null;
}

function productCanOrderWhenOos(product) {
  // Keep this narrower than availability.canOrder: a landed or incoming line
  // may be visible/orderable after confirmation, but it is not an exception to
  // the on-hand quantity cap. Only an explicit "To order" item is uncapped.
  return isToOrderProduct(product);
}

function cartQtyCapForProduct(product) {
  if (!product) return 0;
  // Instore stock is a buy-now ceiling, not a backorder request. Its fresh
  // server-side checkout resolver repeats this cap immediately before order.
  if (product.isExtendedRange === true) return Math.max(0, Math.floor(productStockQtyForCart(product) || 0));
  if (productCanOrderWhenOos(product)) return CART_QTY_UNLIMITED;

  const qty = productStockQtyForCart(product);
  // An unverified stock value is not safe to sell as an ordinary in-stock
  // product. The customer can refresh the catalogue; the server independently
  // rejects it until it can verify the live quantity.
  if (qty === null) return 0;
  // Regular catalogue lines may never exceed physical stock on hand. This is
  // duplicated by the authoritative server guard at submission time.
  return normaliseStockQty(qty) || 0;
}

function normalizeCartQtyInput(qty) {
  const numeric = Number(qty);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.floor(numeric));
}

async function hydrateAccountCartItems(items) {
  const savedItems = mergeBasketLines(items);
  if (!savedItems.length) return [];
  try {
    const mainItems = savedItems.filter(item => knownCartProductSource(item.product) === 'main');
    const instoreItems = savedItems.filter(item => knownCartProductSource(item.product) === 'instore');
    const [bySku, instoreBySku] = await Promise.all([fetchProductsBySkus(mainItems.map((item) => (
      item.product?.id || item.product?.sku || item.product?.code
    ))), instoreItems.length ? fetchInstoreProductsBySkus(instoreItems.map(item => item.product?.sku || item.product?.id)) : new Map()]);
    return mergeBasketLines(recoverCartProducts(savedItems, bySku, instoreBySku));
  } catch {
    return recoverCartProducts(savedItems);
  }
}

function makeCartSyncOperation(accountId, items, activityAt, clearActivityAt = null, intent = 'normal') {
  const fingerprint = cartFingerprint(items);
  if (fingerprint === '[]') {
    return {
      accountId,
      type: 'clear',
      items: [],
      activityAt: clearActivityAt || activityAt || Date.now(),
      fingerprint,
      intent,
    };
  }
  return {
    accountId,
    type: 'save',
    items,
    activityAt: activityAt || Date.now(),
    fingerprint,
    intent: intent === 'restore' ? 'restore' : 'normal',
  };
}

function collectionLabel(collection) {
  if (collection === 'hot') return 'Hot Sellers';
  if (collection === 'clearance') return 'Clearance Stock';
  if (collection === 'specials') return "This Week's Specials";
  if (collection === 'instock') return 'In Stock';
  if (collection === 'soldout') return 'Out of Stock';
  return 'All Products';
}

export default function App({
  customer,
  loginSessionKey = '',
  onLogout,
  onViewProfile,
  onViewAdmin,
  requestedReorder = null,
  onRequestedReorderHandled,
}) {
  const { path, refinements, navigate: hashNavigate, setRefinement } = useHashNav();
  const catalogueRefinements = useMemo(() => {
    const next = { ...refinements };
    delete next.product;
    delete next.q;
    return next;
  }, [refinements]);
  const pathKey = path.join('/');
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
  const routeSearchQuery = catalogueSearchQueryFromRoute(path, refinements);
  const [searchQuery, setSearchQuery] = useState(routeSearchQuery);
  const [inStockOnly, setInStockOnly] = useState(readInStockOnly);
  const [sort, setSort] = useState(readInitialSort);

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
    navigate([]);
  }, [navigate]);

  const navigateForSearch = useCallback((newPath, newRefinements) => {
    hashNavigate(newPath, newRefinements, { scroll: true });
  }, [hashNavigate]);
  useEffect(() => {
    setSearchQuery((current) => (current === routeSearchQuery ? current : routeSearchQuery));
  }, [routeSearchQuery]);
  const [loading, setLoading] = useState(true);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogResultQuery, setCatalogResultQuery] = useState('');
  const [catalogError, setCatalogError] = useState(false);
  const visibleCatalogResults = useMemo(
    () => catalogueResultsForQuery(routeSearchQuery, catalogResultQuery, catalogProducts, catalogTotal),
    [routeSearchQuery, catalogResultQuery, catalogProducts, catalogTotal],
  );
  const catalogueResultsPending = loading || routeSearchQuery.trim() !== catalogResultQuery.trim();
  const [instoreSearch, setInstoreSearch] = useState({ query: '', products: [], total: 0, loading: false, error: false });
  const visibleInstoreSearch = useMemo(() => {
    if (instoreSearch.query.trim() === routeSearchQuery.trim()) return instoreSearch;
    return {
      query: routeSearchQuery.trim(),
      products: [],
      total: 0,
      loading: Boolean(routeSearchQuery.trim()),
      error: false,
    };
  }, [instoreSearch, routeSearchQuery]);
  const [counts, setCounts] = useState({ '': 0 });
  const [usingFallback, setUsingFallback] = useState(false);
  const [page, setPage] = useState(1);
  const [cartItems, setCartItems] = useState(() => {
    try {
      const owner = localStorage.getItem(CART_OWNER_KEY);
      if (owner && owner !== customer?.id) return [];
      return mergeBasketLines(readStoredCart(localStorage, CART_STORAGE_KEY).items);
    } catch { return []; }
  });
  const [cartAnnouncement, setCartAnnouncement] = useState('');
  const [cartPriceChanges, setCartPriceChanges] = useState([]);
  const [cartRevealRequest, setCartRevealRequest] = useState(null);
  const [cartScrollTop, setCartScrollTop] = useState(0);
  const [cartLastActivityAt, setCartLastActivityAt] = useState(readCartActivityAt);
  const [cartClock, setCartClock] = useState(0);
  const [cartSyncStatus, setCartSyncStatus] = useState('loading');
  const [cartSyncIssue, setCartSyncIssue] = useState(null);
  const [cartStorageIssue, setCartStorageIssue] = useState(null);
  const [pendingRecoveryCopies, setPendingRecoveryCopies] = useState([]);
  const [deviceBasketCopy, setDeviceBasketCopy] = useState(() => readLegacyCartCopy(localStorage, customer?.id));
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartPreviewMode, setCartPreviewMode] = useState(false);
  const [flyAnim, setFlyAnim] = useState(null);
  const [drawerPeek, setDrawerPeek] = useState(false);
  const drawerTimerRef = useRef(null);
  const cartRevealSequenceRef = useRef(0);
  const cartTriggerRef = useRef(null);
  const desktopCartRef = useRef(null);
  const mobileCartDialogRef = useRef(null);
  const searchTrackRef = useRef({ rowId: null, searchedAt: null, term: '' });
  const instoreSearchInputRef = useRef(null);
  const lastSearchLogKeyRef = useRef('');
  const hasInitializedCartAnnouncementRef = useRef(false);
  const prevCartSnapshotRef = useRef({ count: 0, total: 0 });
  const cartHydratedRef = useRef(false);
  // Account-cart persistence is intentionally disabled on Vercel Preview so a
  // reviewer cannot read or alter a real customer's saved basket. When the API
  // confirms that condition, this ref enables an on-device demo basket only.
  const cartPreviewModeRef = useRef(false);
  const cartRevisionRef = useRef(0);
  const lastSavedCartRef = useRef('');
  const cartAccountRef = useRef(customer?.id || null);
  const currentCartRef = useRef({ items: cartItems, activityAt: cartLastActivityAt });
  const pendingCartSyncRef = useRef(null);
  const pendingJournalRef = useRef({ accountId: customer?.id || null, raw: null });
  const ownedRecoveryCopyRef = useRef(null);
  const restoredRecoveryCopyRef = useRef(null);
  const cartSyncInFlightRef = useRef(false);
  const cartConflictRef = useRef(false);
  const cartAutomaticRetryBlockedRef = useRef(false);
  const cartUndoTokenRef = useRef(null);
  const cartSyncTimerRef = useRef(null);
  const cartSyncRetryCountRef = useRef(0);
  const cartSyncDrainRef = useRef(null);
  const cartHydrateRetryRef = useRef(null);
  const cartClearActivityAtRef = useRef(null);
  const cartClearIntentRef = useRef('normal');
  const cartRestoreFingerprintRef = useRef(null);
  // An unresolved request survives basket edits and reloads. A new reference
  // must never replace an outcome that may already have committed on the server.
  const checkoutRefRef = useRef(null);
  const lastCheckoutOptionsRef = useRef(null);
  const lastCheckoutSubmissionRef = useRef(null);
  const pendingCheckoutRef = useRef(null);
  const pendingCheckoutStorageErrorRef = useRef(null);
  const checkoutSendingRef = useRef(false);
  const acceptedCheckoutAttemptRef = useRef(null);
  const confirmedCheckoutCleanupRef = useRef(null);
  const [orderRecoveryNote, setOrderRecoveryNote] = useState('');
  const [pendingRequestSummary, setPendingRequestSummary] = useState(null);
  const [recoveryReceiptDurable, setRecoveryReceiptDurable] = useState(true);
  const [clearedCartSnapshot, setClearedCartSnapshot] = useState(null);
  const refreshPendingRecoveryCopies = useCallback(accountId => {
    if (cartAccountRef.current !== accountId) return;
    try {
      setPendingRecoveryCopies(readPendingCartRecoveryCopies(localStorage, accountId).filter(copy => (
        copy.raw !== pendingJournalRef.current.raw && copy.key !== ownedRecoveryCopyRef.current?.copyKey
      )));
    } catch {
      setCartStorageIssue({ code: 'cart_device_storage', detail: 'Pending basket recovery copies could not be checked. Keep this page open and retry sync before leaving.' });
    }
  }, []);
  const keepPendingCart = useCallback((accountId, operation, revision) => {
    try {
      if (localStorage.getItem(`proto_cart_pending_${accountId}`) !== pendingJournalRef.current.raw) {
        cartConflictRef.current = true;
        setCartSyncStatus('error');
        setCartStorageIssue({ code: 'cart_conflict', detail: 'Another tab has pending basket changes. Its copy was kept. Reload to review it before changing this basket.' });
        return false;
      }
    } catch { /* the verified write below reports unavailable storage */ }
    const previousCopy = ownedRecoveryCopyRef.current;
    const successor = writeRecoverablePendingCart(localStorage, accountId, operation, revision);
    const kept = successor.kept;
    if (successor.copyKey) ownedRecoveryCopyRef.current = { accountId, ...successor };
    if (kept) {
      pendingJournalRef.current = { accountId, raw: successor.raw };
      if (previousCopy?.accountId === accountId && previousCopy.copyKey !== successor.copyKey) {
        retireSupersededPendingCartRecoveryCopy(localStorage, accountId, previousCopy.copyKey, previousCopy.raw, successor);
      }
    }
    setCartStorageIssue(kept ? null : {
      code: 'cart_device_storage',
      detail: 'This browser could not keep pending basket changes. Keep this page open and do not sign out until account sync succeeds. Your basket cannot be cleared safely yet.',
    });
    refreshPendingRecoveryCopies(accountId);
    return kept;
  }, [refreshPendingRecoveryCopies]);
  const removePendingCart = useCallback((accountId, expectedRaw = pendingJournalRef.current.accountId === accountId ? pendingJournalRef.current.raw : null) => {
    try {
      const current = localStorage.getItem(`proto_cart_pending_${accountId}`);
      if (current !== null && current !== expectedRaw) {
        cartConflictRef.current = true;
        setCartSyncStatus('error');
        setCartStorageIssue({ code: 'cart_conflict', detail: 'Another tab has pending basket changes. Its copy was kept. Reload to review it before changing this basket.' });
        return false;
      }
    } catch { /* verified cleanup reports unavailable storage */ }
    let removed = clearPendingCart(localStorage, accountId, expectedRaw);
    if (removed && expectedRaw !== null) removed = acknowledgePendingCartRecoveryCopies(localStorage, accountId, expectedRaw);
    const restored = restoredRecoveryCopyRef.current;
    if (removed && restored?.accountId === accountId && restored.fingerprint === lastSavedCartRef.current) {
      removed = acknowledgePendingCartRecoveryCopies(localStorage, accountId, restored.raw);
      if (removed) restoredRecoveryCopyRef.current = null;
    }
    if (removed && pendingJournalRef.current.accountId === accountId
      && pendingJournalRef.current.raw === expectedRaw) pendingJournalRef.current = { accountId, raw: null };
    setCartStorageIssue(removed ? null : {
      code: 'cart_device_storage',
      detail: 'The account basket was confirmed, but this browser could not remove its older pending copy. Retry sync before leaving or changing this basket.',
    });
    refreshPendingRecoveryCopies(accountId);
    return removed;
  }, [refreshPendingRecoveryCopies]);
  const finishConfirmedCheckoutCleanup = useCallback(async accountId => {
    const identity = captureAuthIdentity();
    const ownsAccount = () => captureAuthIdentity() === identity && identity.userId === accountId && cartAccountRef.current === accountId;
    try {
      return await withPendingCheckoutLock(navigator.locks, accountId, async () => {
        assertAuthIdentity(identity);
        if (!ownsAccount()) return false;
        let attempt = readPendingCheckout(localStorage, accountId);
        if (!attempt) return true;
        const accepted = acceptedCheckoutAttemptRef.current;
        if (attempt.status === 'pending' && accepted?.customerId === accountId
          && accepted.payload.clientRef === attempt.payload.clientRef && accepted.raw === attempt.raw) {
          attempt = acceptPendingCheckout(localStorage, attempt, accepted.result);
          pendingCheckoutRef.current = attempt;
          setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
        }
        if (attempt.status !== 'accepted') return false;
        const confirmed = confirmedCheckoutCleanupRef.current;
        let acknowledged = confirmed?.accountId === accountId
          && confirmed.clientRef === attempt.payload.clientRef && confirmed.fingerprint === attempt.fingerprint;
        if (!acknowledged) {
          // A reload needs a fresh, locked read and an acknowledged conditional
          // DELETE. An empty UI alone never proves accepted-basket cleanup.
          if (currentCartRef.current.items.length || pendingCartSyncRef.current || cartSyncInFlightRef.current) return false;
          const remote = await getAccountCart();
          assertAuthIdentity(identity);
          if (!ownsAccount() || remote.items.length || currentCartRef.current.items.length
            || pendingCartSyncRef.current || cartSyncInFlightRef.current) return false;
          verifyPendingCheckout(localStorage, attempt);
          const cleared = await clearAccountCart(remote.revision, Date.now());
          assertAuthIdentity(identity);
          if (!ownsAccount() || cleared.items.length || currentCartRef.current.items.length
            || pendingCartSyncRef.current || cartSyncInFlightRef.current) return false;
          acknowledged = true;
          cartRevisionRef.current = cleared.revision;
        }
        if (localStorage.getItem(`proto_cart_pending_${accountId}`) !== null
          || readPendingCartRecoveryCopies(localStorage, accountId).length) return false;
        if (!finishPendingCheckout(localStorage, accountId, attempt.payload.clientRef,
          { acknowledgedSubmittedClear: acknowledged })) throw new Error('Reference cleanup failed');
        confirmedCheckoutCleanupRef.current = null;
        acceptedCheckoutAttemptRef.current = null;
        pendingCheckoutRef.current = null;
        setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
        pendingCheckoutStorageErrorRef.current = null;
        checkoutRefRef.current = null;
        return true;
      });
    } catch {
      if (ownsAccount()) setCartStorageIssue({ code: 'checkout_cleanup', detail: 'Your order was received, but its recovery reference could not be cleaned up. Do not resubmit. Keep this page open and retry basket cleanup.' });
      return false;
    }
  }, []);
  const canChangeBasket = useCallback(() => {
    if (!cartHydratedRef.current) return false;
    if (cartPreviewModeRef.current) return true;
    const accountId = cartAccountRef.current;
    try {
      if (localStorage.getItem(`proto_cart_pending_${accountId}`) !== pendingJournalRef.current.raw) {
        cartConflictRef.current = true;
        setCartSyncStatus('error');
        setCartStorageIssue({ code: 'cart_conflict', detail: 'Another tab has pending basket changes. Its copy was kept. Reload to review it before changing this basket.' });
        return false;
      }
    } catch { /* pending writes/cleanup expose unavailable storage */ }
    return true;
  }, []);
  useEffect(() => {
    if (!cartStorageIssue) return undefined;
    const warn = event => {
      if (!pendingCartSyncRef.current && !cartSyncInFlightRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [cartStorageIssue]);
  const discardDeviceBasketCopy = useCallback(async expectedCopy => {
    if (cartAccountRef.current !== expectedCopy?.accountId) return;
    const removed = await discardLegacyCartCopy(localStorage, customer?.id, expectedCopy,
      () => cartAccountRef.current === expectedCopy?.accountId);
    if (cartAccountRef.current !== expectedCopy?.accountId) return;
    if (removed) setDeviceBasketCopy(null);
    else {
      setDeviceBasketCopy(readLegacyCartCopy(localStorage, customer?.id));
      setCartAnnouncement('The device copy changed or could not be discarded. Review the latest copy before trying again.');
    }
  }, [customer?.id]);
  const [activeCollection, setActiveCollection] = useState('all');
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [reorderModal, setReorderModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [orderHistoryResolved, setOrderHistoryResolved] = useState(false);
  const [orderHistoryAvailable, setOrderHistoryAvailable] = useState(false);
  const [customerJourney, setCustomerJourney] = useState(null);
  const [journeyReady, setJourneyReady] = useState(false);
  const [loginBasketSnapshot, setLoginBasketSnapshot] = useState(null);
  const [browseCategories, setBrowseCategories] = useState([]);
  const [specialsMap, setSpecialsMap] = useState({});
  const [bannerConfig, setBannerConfig] = useState(null);
  const [popupConfig, setPopupConfig] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const journeyAccountRef = useRef(null);

  useEffect(() => {
    journeyAccountRef.current = null;
    setJourneyReady(false);
    setCustomerJourney(null);
    setLoginBasketSnapshot(null);
  }, [customer?.id]);

  useLayoutEffect(() => {
    currentCartRef.current = { items: cartItems, activityAt: cartLastActivityAt };
  }, [cartItems, cartLastActivityAt]);

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
    const eventTrigger = event?.currentTarget;
    const persistentTrigger = eventTrigger?.closest?.('.customer-journey-prompt')
      ? document.querySelector(
        window.innerWidth <= 900
          ? '[data-cart-trigger="mobile"]'
          : '[data-cart-trigger="desktop"]',
      )
      : eventTrigger;
    cartTriggerRef.current = persistentTrigger || document.activeElement;
    setCustomerJourney(null);
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
    if (!cartHydratedRef.current) return;
    const accountId = cartAccountRef.current;
    if (readPendingBytes(accountId) !== pendingJournalRef.current.raw) {
      setCartStorageIssue({ code: 'cart_conflict', detail: 'Another tab has pending basket changes. Its copy was kept. Reload to review it before changing this basket.' });
      return;
    }
    try {
      if (cartItems.length) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
      else localStorage.removeItem(CART_STORAGE_KEY);
    } catch { /* ignore */ }
  }, [cartItems, cartHydrated]);

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

  const scheduleCartSync = useCallback((delay = 0) => {
    if (cartSyncTimerRef.current) window.clearTimeout(cartSyncTimerRef.current);
    cartSyncTimerRef.current = window.setTimeout(() => {
      cartSyncTimerRef.current = null;
      void cartSyncDrainRef.current?.();
    }, delay);
  }, []);

  const drainCartSyncQueue = useCallback(async () => {
    if (cartPreviewModeRef.current || cartConflictRef.current || cartAutomaticRetryBlockedRef.current || cartSyncInFlightRef.current || !cartHydratedRef.current) return;
    const operation = pendingCartSyncRef.current;
    const accountId = cartAccountRef.current;
    if (!operation || !accountId || operation.accountId !== accountId) return;

    const identity = captureAuthIdentity();
    const ownsOperation = () => captureAuthIdentity() === identity && identity.userId === accountId && cartAccountRef.current === accountId;
    pendingCartSyncRef.current = null;
    cartSyncInFlightRef.current = true;
    const dispatchedItems = currentCartRef.current.items;
    const dispatchedActivityAt = currentCartRef.current.activityAt;
    operation.baseRevision ??= cartRevisionRef.current;
    keepPendingCart(accountId, operation, operation.baseRevision);
    if (cartConflictRef.current) {
      pendingCartSyncRef.current ||= operation;
      cartSyncInFlightRef.current = false;
      return;
    }
    const dispatchedJournalRaw = pendingJournalRef.current.raw;
    let dispatchedCheckoutAttempt = null;
    if (operation.intent === 'submitted_clear') {
      try { dispatchedCheckoutAttempt = readPendingCheckout(localStorage, accountId); } catch { dispatchedCheckoutAttempt = acceptedCheckoutAttemptRef.current; }
    }
    setCartSyncStatus('saving');
    let acknowledged = false;
    let automaticRetryAllowed = true;
    try {
      const saved = operation.type === 'clear'
        ? await clearAccountCart(operation.baseRevision, operation.activityAt)
        : await saveAccountCart(operation.items, operation.activityAt, operation.baseRevision);
      if (!ownsOperation()) return;
      cartRevisionRef.current = Number(saved.revision || 0);
      lastSavedCartRef.current = cartFingerprint(saved.items);
      if (operation.type === 'clear') {
        cartClearActivityAtRef.current = null;
        cartClearIntentRef.current = 'normal';
      }
      if (operation.intent === 'restore') cartRestoreFingerprintRef.current = null;
      cartSyncRetryCountRef.current = 0;
      acknowledged = true;
    } catch (error) {
      if (!ownsOperation()) return;
      const restoreConflict = operation.intent === 'restore'
        && error.status === 409
        && Array.isArray(error.data?.items);
      const submittedClearConflict = operation.intent === 'submitted_clear'
        && error.status === 409
        && Array.isArray(error.data?.items);
      if (restoreConflict || submittedClearConflict) {
        const hasNewerLocalIntent = () => currentCartRef.current.items !== dispatchedItems
          || currentCartRef.current.activityAt !== dispatchedActivityAt;
        if (hasNewerLocalIntent()) {
          cartConflictRef.current = true;
          setCartSyncIssue(cartSyncFailure(error));
          setCartSyncStatus('error');
          return;
        }
        const remoteItems = await hydrateAccountCartItems(error.data.items);
        if (!ownsOperation()) return;
        if (hasNewerLocalIntent()) {
          cartConflictRef.current = true;
          setCartSyncIssue(cartSyncFailure(error));
          setCartSyncStatus('error');
          return;
        }
        const remoteActivityAt = error.data.activityAt || null;
        cartRevisionRef.current = Number(error.data.revision || 0);
        lastSavedCartRef.current = cartFingerprint(remoteItems);
        cartRestoreFingerprintRef.current = null;
        cartClearIntentRef.current = 'normal';
        setCartItems(remoteItems);
        setCartLastActivityAt(remoteActivityAt);
        currentCartRef.current = { items: remoteItems, activityAt: remoteActivityAt };
        setClearedCartSnapshot(null);
        if (submittedClearConflict) setOrderRecoveryNote('A newer saved basket was kept. Review the received order, then use Review current basket before submitting another order.');
        setCartAnnouncement(submittedClearConflict
          ? 'Your order was received. A newer basket from another device has been kept.'
          : 'A newer basket was saved on another device, so the older cleared basket was not restored.');
      } else if (error.status === 409 && Array.isArray(error.data?.items)) {
        // A timeout may have committed already. A matching snapshot is an
        // acknowledgement; divergence is NOT authority to overwrite a device.
        if (cartFingerprint(error.data.items) === operation.fingerprint) {
          cartRevisionRef.current = Number(error.data.revision || 0);
          lastSavedCartRef.current = operation.fingerprint;
          cartSyncRetryCountRef.current = 0;
          acknowledged = true;
        } else {
          cartConflictRef.current = true;
          pendingCartSyncRef.current ||= operation;
          setCartSyncIssue(cartSyncFailure(error));
          setCartSyncStatus('error');
        }
      } else {
        automaticRetryAllowed = ![400, 401, 403, 413, 422].includes(error?.status);
        cartAutomaticRetryBlockedRef.current = !automaticRetryAllowed;
        cartSyncRetryCountRef.current += 1;
        setCartSyncIssue(cartSyncFailure(error));
        setCartSyncStatus('error');
        trackJourneyEvent('basket_sync_failed', {
          journey: 'basket',
          step: operation.type,
          outcome: 'error',
          metadata: { retry: cartSyncRetryCountRef.current },
        });
      }
      if (!restoreConflict && !submittedClearConflict && !cartConflictRef.current) {
        const latest = currentCartRef.current;
        const latestFingerprint = cartFingerprint(latest.items);
        const nextOperation = makeCartSyncOperation(
          accountId,
          latest.items,
          latest.activityAt,
          cartClearActivityAtRef.current,
          cartRestoreFingerprintRef.current === latestFingerprint ? 'restore' : cartClearIntentRef.current,
        );
        if (nextOperation.type === 'clear') cartClearActivityAtRef.current = nextOperation.activityAt;
        pendingCartSyncRef.current = nextOperation;
      }
    } finally {
      if (ownsOperation()) cartSyncInFlightRef.current = false;
      if (ownsOperation()) {
        const latest = currentCartRef.current;
        const latestFingerprint = cartFingerprint(latest.items);
        if (latestFingerprint !== lastSavedCartRef.current && !pendingCartSyncRef.current) {
          const nextOperation = makeCartSyncOperation(
            accountId,
            latest.items,
            latest.activityAt,
            cartClearActivityAtRef.current,
            cartRestoreFingerprintRef.current === latestFingerprint ? 'restore' : cartClearIntentRef.current,
          );
          if (nextOperation.type === 'clear') cartClearActivityAtRef.current = nextOperation.activityAt;
          pendingCartSyncRef.current = nextOperation;
        }
        if (cartConflictRef.current) {
          setCartSyncStatus('error');
        } else if (pendingCartSyncRef.current) {
          if (acknowledged) {
            pendingCartSyncRef.current.baseRevision = cartRevisionRef.current;
            keepPendingCart(accountId, pendingCartSyncRef.current, cartRevisionRef.current);
          }
          const retryDelay = cartSyncRetryCountRef.current
            ? Math.min(30_000, 1000 * (2 ** Math.min(5, cartSyncRetryCountRef.current - 1)))
            : 0;
          if (automaticRetryAllowed) scheduleCartSync(retryDelay);
          else {
            if (cartSyncTimerRef.current) window.clearTimeout(cartSyncTimerRef.current);
            cartSyncTimerRef.current = null;
            setCartSyncStatus('error');
          }
        } else {
          const removed = removePendingCart(accountId, dispatchedJournalRaw);
          if (acknowledged && dispatchedCheckoutAttempt && operation.intent === 'submitted_clear') {
            confirmedCheckoutCleanupRef.current = { accountId, clientRef: dispatchedCheckoutAttempt.payload.clientRef, fingerprint: dispatchedCheckoutAttempt.fingerprint };
            if (removed) await finishConfirmedCheckoutCleanup(accountId);
          }
          if (ownsOperation()) setCartSyncStatus('saved');
        }
      }
    }
  }, [scheduleCartSync, keepPendingCart, removePendingCart, finishConfirmedCheckoutCleanup]);
  useEffect(() => {
    cartSyncDrainRef.current = drainCartSyncQueue;
  }, [drainCartSyncQueue]);

  // Tell the admin dashboard this customer is browsing. Keyed on the account
  // id so signing out (or switching account) clears the previous row rather
  // than leaving a ghost in the live count until the window lapses.
  useEffect(() => {
    if (!customer?.id) return undefined;
    return startPresenceHeartbeat();
  }, [customer?.id]);

  // Merge this browser's basket into the account before allowing mutations.
  // Failed hydration is retried while the local basket remains safely visible.
  useEffect(() => {
    const uid = customer?.id || null;
    if (!uid) return;
    const identity = captureAuthIdentity();
    let cancelled = false;
    const ownsHydration = () => !cancelled && captureAuthIdentity() === identity && identity.userId === uid && cartAccountRef.current === uid;
    let hydrationRetryTimer = null;
    let hydrationFailures = 0;
    let hydrationInFlight = false;
    const previousUid = cartAccountRef.current;
    cartAccountRef.current = uid;
    cartHydratedRef.current = false;
    cartConflictRef.current = false;
    cartAutomaticRetryBlockedRef.current = false;
    cartSyncInFlightRef.current = false;
    cartPreviewModeRef.current = false;
    setCartPreviewMode(false);
    setCartHydrated(false);
    setLoginBasketSnapshot(null);
    setCartSyncStatus('loading');
    setCartSyncIssue(null);
    pendingCartSyncRef.current = null;
    cartSyncRetryCountRef.current = 0;
    if (cartSyncTimerRef.current) window.clearTimeout(cartSyncTimerRef.current);

    let localItems = [];
    let localActivityAt = null;
    let unreadableCanonical = null;
    const pendingRaw = readPendingBytes(uid);
    pendingJournalRef.current = { accountId: uid, raw: pendingRaw };
    ownedRecoveryCopyRef.current = null;
    restoredRecoveryCopyRef.current = null;
    refreshPendingRecoveryCopies(uid);
    const pendingDraft = readPendingCart(localStorage, uid);
    setDeviceBasketCopy(readLegacyCartCopy(localStorage, uid));
    try {
      const owner = localStorage.getItem(CART_OWNER_KEY);
      if (!owner || owner === uid) {
        const stored = readStoredCart(localStorage, CART_STORAGE_KEY);
        localItems = mergeBasketLines(stored.items);
        unreadableCanonical = stored.unreadableRaw;
        localActivityAt = readCartActivityAt();
        if (localItems.length && !localActivityAt) {
          localActivityAt = Date.now();
          localStorage.setItem(CART_LAST_ACTIVITY_KEY, String(localActivityAt));
        }
      } else {
        // Never leave the previous account's basket under the new owner key.
        localStorage.removeItem(CART_STORAGE_KEY);
        localStorage.removeItem(CART_LAST_ACTIVITY_KEY);
      }
      localStorage.setItem(CART_OWNER_KEY, uid);
    } catch { /* use the in-memory fallback */ }
    if (pendingDraft) {
      localItems = mergeBasketLines(pendingDraft.items);
      localActivityAt = pendingDraft.activityAt;
    }

    if (previousUid && previousUid !== uid) {
      setCartItems([]);
      setCartPriceChanges([]);
      setCartLastActivityAt(null);
      currentCartRef.current = { items: [], activityAt: null };
    }

    const hydrate = async () => {
      // Manual retry and the backoff timer must not race account imports.
      if (cancelled || hydrationInFlight) return;
      if (!ownsHydration()) return;
      hydrationInFlight = true;
      setCartSyncStatus('loading');
      try {
        if (unreadableCanonical !== null) {
          archiveUnreadableCart(localStorage, CART_STORAGE_KEY, unreadableCanonical);
          unreadableCanonical = null;
        }
        // A rejected journal may contain recoverable customer work. Archive its
        // exact bytes before normal hydration is allowed to remove the slot.
        if (!pendingDraft) {
          let raw = null;
          try { raw = localStorage.getItem(`proto_cart_pending_${uid}`); } catch { /* unavailable storage */ }
          if (raw !== null) archiveUnreadableCart(localStorage, `proto_cart_pending_${uid}`, raw);
        }
        const accountCart = await mergeAccountCart(localItems, localActivityAt);
        if (!ownsHydration()) return;
        assertPendingSnapshot(uid, pendingRaw);
        if (!pendingDraft && localItems.length && cartFingerprint(localItems) !== cartFingerprint(accountCart.items)) {
          // Keep legacy unsaved work before adopting the authoritative account
          // basket. Storage failure must stop recovery, not erase the device.
          const copy = await preserveLegacyCartCopy(localStorage, uid, localItems, localActivityAt,
            () => ownsHydration() && readPendingBytes(uid) === pendingRaw);
          if (!ownsHydration()) return;
          assertPendingSnapshot(uid, pendingRaw);
          setDeviceBasketCopy(copy);
        }
        if (pendingDraft && cartFingerprint(accountCart.items) !== cartFingerprint(pendingDraft.items)) {
          const draftItems = await hydrateAccountCartItems(pendingDraft.items);
          if (!ownsHydration()) return;
          assertPendingSnapshot(uid, pendingRaw);
          cartRevisionRef.current = pendingDraft.baseRevision;
          lastSavedCartRef.current = cartFingerprint(accountCart.items);
          setCartItems(draftItems);
          setCartLastActivityAt(localActivityAt);
          currentCartRef.current = { items: draftItems, activityAt: localActivityAt };
          cartHydratedRef.current = true;
          setCartHydrated(true);
          if (accountCart.revision !== pendingDraft.baseRevision) {
            cartConflictRef.current = true;
            setCartSyncIssue(cartSyncFailure({ status: 409 }));
            setCartSyncStatus('error');
          } else {
            cartClearActivityAtRef.current = pendingDraft.type === 'clear' ? pendingDraft.activityAt : null;
            cartClearIntentRef.current = pendingDraft.intent;
            setCartSyncStatus('saving');
          }
          return;
        }
        const hydratedItems = await hydrateAccountCartItems(accountCart.items);
        if (!ownsHydration()) return;
        assertPendingSnapshot(uid, pendingRaw);
        cartRevisionRef.current = Number(accountCart.revision || 0);
        lastSavedCartRef.current = cartFingerprint(hydratedItems);
        setLoginBasketSnapshot({
          accountId: uid,
          fingerprint: cartFingerprint(hydratedItems),
          itemCount: hydratedItems.reduce(
            (count, item) => count + Math.max(0, Number(item.qty) || 0),
            0,
          ),
          totalInclVat: hydratedItems.reduce(
            (total, item) => total + (
              (Number(item.product.price) || 0) * Math.max(0, Number(item.qty) || 0)
            ),
            0,
          ),
        });
        setCartItems(hydratedItems);
        setCartPriceChanges(detectCartPriceChanges(accountCart.items, hydratedItems));
        setCartLastActivityAt(accountCart.activityAt || null);
        currentCartRef.current = { items: hydratedItems, activityAt: accountCart.activityAt || null };
        setCartClock(Date.now());
        cartHydratedRef.current = true;
        setCartHydrated(true);
        setCartSyncStatus('saved');
        removePendingCart(uid, pendingRaw);
      } catch (error) {
        if (!ownsHydration()) return;
        // Preview deployments intentionally return 403 for account-cart so a
        // reviewer cannot read or alter a real customer's saved basket. Some
        // Vercel edge responses omit the JSON message, therefore the preview
        // host and status are the dependable boundary. Keep this strictly off
        // the live custom domain so a real account permission failure remains
        // visible rather than being hidden by local mode.
        const previewBasketBlocked = window.location.hostname.endsWith('.vercel.app')
          && error?.status === 403;
        if (previewBasketBlocked) {
          // This is the expected preview security boundary, not a failed
          // customer basket. Permit add/remove/quantity demonstration locally
          // without retrying or writing to the account service.
          cartPreviewModeRef.current = true;
          setCartPreviewMode(true);
          cartRevisionRef.current = 0;
          lastSavedCartRef.current = cartFingerprint(localItems);
          setCartItems(localItems);
          setCartPriceChanges([]);
          setCartLastActivityAt(localActivityAt);
          currentCartRef.current = { items: localItems, activityAt: localActivityAt };
          setCartClock(Date.now());
          cartHydratedRef.current = true;
          setCartHydrated(true);
          setCartSyncStatus('preview');
          return;
        }
        hydrationFailures += 1;
        setCartSyncIssue(error?.code === 'cart_device_storage' ? {
          code: 'cart_device_storage',
          detail: 'This browser could not safely preserve unreadable basket data. Your original device copy is kept. Restore browser storage and retry account basket sync before changing this basket.',
          retryable: false,
        } : cartSyncFailure(error));
        setCartItems(localItems);
        setCartLastActivityAt(localActivityAt);
        currentCartRef.current = { items: localItems, activityAt: localActivityAt };
        setCartSyncStatus('error');
        // Record only a safe failure category and avoid a three-second retry
        // loop during an outage. Basket contents are never included here.
        if (hydrationFailures === 1 || hydrationFailures % 5 === 0) {
          trackJourneyEvent('basket_sync_failed', {
            journey: 'basket',
            step: 'hydrate',
            outcome: 'error',
            metadata: {
              retry: true,
              attempt: hydrationFailures,
              status: Number.isInteger(error?.status) ? error.status : null,
            },
          });
        }
        const retryDelay = Math.min(30_000, 3000 * (2 ** Math.min(4, hydrationFailures - 1)));
        // Repeating an unchanged invalid basket or permission failure cannot
        // recover it. Leave the local basket intact and offer an explicit retry.
        if (![400, 401, 403, 409, 413, 422].includes(error?.status)) {
          hydrationRetryTimer = window.setTimeout(hydrate, retryDelay);
        }
      } finally {
        hydrationInFlight = false;
      }
    };
    cartHydrateRetryRef.current = () => {
      if (hydrationRetryTimer) window.clearTimeout(hydrationRetryTimer);
      hydrationRetryTimer = null;
      return hydrate();
    };
    void hydrate();

    return () => {
      cancelled = true;
      if (cartAccountRef.current === uid) cartAccountRef.current = null;
      if (hydrationRetryTimer) window.clearTimeout(hydrationRetryTimer);
      cartHydrateRetryRef.current = null;
    };
  }, [customer?.id, removePendingCart, refreshPendingRecoveryCopies]);

  useEffect(() => {
    if (!customer?.id || !cartHydratedRef.current || cartPreviewModeRef.current) return undefined;
    const fingerprint = cartFingerprint(cartItems);
    if (fingerprint === lastSavedCartRef.current && !cartSyncInFlightRef.current && !cartConflictRef.current) {
      if (cartSyncTimerRef.current) window.clearTimeout(cartSyncTimerRef.current);
      cartSyncTimerRef.current = null;
      pendingCartSyncRef.current = null;
      cartClearActivityAtRef.current = null;
      cartClearIntentRef.current = 'normal';
      cartRestoreFingerprintRef.current = null;
      removePendingCart(customer.id);
      setCartSyncStatus('saved');
      return undefined;
    }
    const nextOperation = makeCartSyncOperation(
      customer.id,
      cartItems,
      cartLastActivityAt,
      cartClearActivityAtRef.current,
      cartRestoreFingerprintRef.current === fingerprint ? 'restore' : cartClearIntentRef.current,
    );
    if (nextOperation.type === 'clear') cartClearActivityAtRef.current = nextOperation.activityAt;
    const existingDraft = readPendingCart(localStorage, customer.id);
    keepPendingCart(customer.id, nextOperation, existingDraft?.baseRevision ?? cartRevisionRef.current);
    pendingCartSyncRef.current = nextOperation;
    if (cartConflictRef.current) return undefined;
    cartAutomaticRetryBlockedRef.current = false;
    setCartSyncStatus('saving');
    scheduleCartSync(450);
    return undefined;
  }, [cartItems, cartLastActivityAt, customer?.id, scheduleCartSync, keepPendingCart, removePendingCart]);

  const refreshAccountCart = useCallback(async () => {
    const accountId = cartAccountRef.current;
    if (cartPreviewModeRef.current || !accountId || !cartHydratedRef.current || cartSyncInFlightRef.current || pendingCartSyncRef.current) return;
    const identity = captureAuthIdentity();
    const ownsAccount = () => captureAuthIdentity() === identity && identity.userId === accountId && cartAccountRef.current === accountId;
    const beforeFingerprint = cartFingerprint(currentCartRef.current.items);
    const beforeJournal = pendingJournalRef.current.raw;
    if (beforeFingerprint !== lastSavedCartRef.current) return;
    try {
      const remote = await getAccountCart();
      if (!ownsAccount() || cartSyncInFlightRef.current || pendingCartSyncRef.current) return;
      assertPendingSnapshot(accountId, beforeJournal);
      if (Number(remote.revision || 0) <= cartRevisionRef.current) {
        setCartSyncStatus('saved');
        return;
      }
      if (cartFingerprint(currentCartRef.current.items) !== beforeFingerprint) return;
      const hydratedItems = await hydrateAccountCartItems(remote.items);
      if (!ownsAccount() || cartSyncInFlightRef.current || pendingCartSyncRef.current) return;
      assertPendingSnapshot(accountId, beforeJournal);
      if (cartFingerprint(currentCartRef.current.items) !== beforeFingerprint) return;
      if (Number(remote.revision || 0) <= cartRevisionRef.current) return;
      cartUndoTokenRef.current = null;
      setClearedCartSnapshot(null);
      cartRevisionRef.current = Number(remote.revision || 0);
      lastSavedCartRef.current = cartFingerprint(hydratedItems);
      setCartItems(hydratedItems);
      setCartPriceChanges(detectCartPriceChanges(remote.items, hydratedItems));
      setCartLastActivityAt(remote.activityAt || null);
      currentCartRef.current = { items: hydratedItems, activityAt: remote.activityAt || null };
      setCartClock(Date.now());
      setCartSyncStatus('saved');
    } catch (error) {
      if (!ownsAccount()) return;
      // Keep the device copy, but make the failed account sync visible.
      setCartSyncIssue(cartSyncFailure(error));
      setCartSyncStatus('error');
      trackJourneyEvent('basket_sync_failed', {
        journey: 'basket',
        step: 'refresh',
        outcome: 'error',
      });
    }
  }, []);

  const retryCartSync = useCallback(async () => {
    if (!customer?.id) return;
    if (cartStorageIssue && !pendingCartSyncRef.current && !cartSyncInFlightRef.current
      && cartFingerprint(currentCartRef.current.items) === lastSavedCartRef.current) {
      if (!removePendingCart(customer.id)) return;
      if (!await finishConfirmedCheckoutCleanup(customer.id)) return;
    }
    if (cartConflictRef.current) {
      setCartSyncStatus('error');
      setCartSyncIssue(cartSyncFailure({ status: 409 }));
      return;
    }
    if (cartPreviewModeRef.current) {
      setCartSyncStatus('preview');
      return;
    }
    if (!cartHydratedRef.current) {
      setCartSyncStatus('loading');
      void cartHydrateRetryRef.current?.();
      return;
    }
    cartAutomaticRetryBlockedRef.current = false;
    setCartSyncStatus('saving');
    if (pendingCartSyncRef.current) scheduleCartSync(0);
    else void refreshAccountCart();
  }, [customer, refreshAccountCart, scheduleCartSync, cartStorageIssue, removePendingCart, finishConfirmedCheckoutCleanup]);

  useEffect(() => {
    if (!cartHydrated || cartItems.length || cartSyncStatus !== 'saved' || !customer?.id
      || pendingCartSyncRef.current || cartSyncInFlightRef.current) return;
    // Only accepted references can be retired after reload. Pending/uncertain
    // attempts stay intact even when the current basket is empty.
    void finishConfirmedCheckoutCleanup(customer.id);
  }, [cartHydrated, cartItems.length, cartSyncStatus, customer?.id, finishConfirmedCheckoutCleanup]);

  const discardPendingRecoveryCopy = useCallback(copy => {
    const accountId = cartAccountRef.current;
    try {
      if (!copy?.draft || copy.draft.accountId !== accountId || localStorage.getItem(copy.key) !== copy.raw) return;
      localStorage.removeItem(copy.key);
      if (localStorage.getItem(copy.key) !== null) throw new Error('Recovery copy removal failed');
      refreshPendingRecoveryCopies(accountId);
    } catch {
      setCartStorageIssue({ code: 'cart_device_storage', detail: 'The reviewed pending copy could not be removed. It has been kept. Retry after browser storage is available.' });
    }
  }, [refreshPendingRecoveryCopies]);

  const restorePendingRecoveryCopy = useCallback(async copy => {
    const identity = captureAuthIdentity();
    const accountId = cartAccountRef.current;
    const ownsAction = () => captureAuthIdentity() === identity && identity.userId === accountId
      && cartAccountRef.current === accountId && cartHydratedRef.current
      && !pendingCartSyncRef.current && !cartSyncInFlightRef.current && !cartConflictRef.current;
    if (!copy?.draft || copy.draft.accountId !== accountId || !ownsAction()) return;
    // Resolve queued local edits before taking the recovery snapshot. A
    // quantity-only fingerprint cannot protect price or source changes.
    flushSync(() => {});
    if (!ownsAction()) return;
    const before = JSON.stringify(currentCartRef.current.items);
    const revision = cartRevisionRef.current;
    const beforeActivity = currentCartRef.current.activityAt;
    const expectedPending = pendingJournalRef.current.raw;
    const checkoutRaw = pendingCheckoutRef.current?.raw;
    const optionsBytes = JSON.stringify(lastCheckoutOptionsRef.current);
    const items = await hydrateAccountCartItems(copy.draft.items);
    flushSync(() => {});
    if (!ownsAction() || JSON.stringify(currentCartRef.current.items) !== before
      || cartRevisionRef.current !== revision || currentCartRef.current.activityAt !== beforeActivity
      || pendingJournalRef.current.raw !== expectedPending || readPendingBytes(accountId) !== expectedPending
      || pendingCheckoutRef.current?.raw !== checkoutRaw
      || JSON.stringify(lastCheckoutOptionsRef.current) !== optionsBytes) return;
    try { if (localStorage.getItem(copy.key) !== copy.raw) return; } catch { return; }
    const activityAt = Date.now();
    const intent = copy.draft.type === 'clear' ? copy.draft.intent : 'restore';
    const operation = makeCartSyncOperation(accountId, items, activityAt, items.length ? null : activityAt, intent);
    if (!keepPendingCart(accountId, operation, cartRevisionRef.current)) return;
    restoredRecoveryCopyRef.current = { accountId, raw: copy.raw, fingerprint: cartFingerprint(items) };
    cartRestoreFingerprintRef.current = items.length ? cartFingerprint(items) : null;
    cartClearIntentRef.current = intent;
    cartClearActivityAtRef.current = items.length ? null : activityAt;
    currentCartRef.current = { items, activityAt };
    setCartItems(items);
    setCartLastActivityAt(items.length ? activityAt : null);
    pendingCartSyncRef.current = { ...operation, baseRevision: cartRevisionRef.current };
    setCartSyncStatus('saving');
    // The existing cart effect schedules this intent after React commits it.
    // Dispatching here could race that effect and queue the same restore twice.
  }, [keepPendingCart]);

  useEffect(() => {
    const onStorage = event => {
      if (event.key === null || event.key?.startsWith('proto_cart_recovery:')) refreshPendingRecoveryCopies(cartAccountRef.current);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshPendingRecoveryCopies]);

  useEffect(() => {
    if (!customer?.id) return undefined;
    const retryAndRefresh = () => {
      if (cartAutomaticRetryBlockedRef.current) return;
      if (pendingCartSyncRef.current) scheduleCartSync(0);
      else void refreshAccountCart();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') retryAndRefresh();
    };
    window.addEventListener('focus', retryAndRefresh);
    window.addEventListener('online', retryAndRefresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAccountCart();
    }, 30_000);
    return () => {
      window.removeEventListener('focus', retryAndRefresh);
      window.removeEventListener('online', retryAndRefresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(pollTimer);
    };
  }, [customer?.id, refreshAccountCart, scheduleCartSync]);

  useEffect(() => {
    setCartClock(Date.now());
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
  }, [pathKey]);

  useEffect(() => {
    // Collection switches represent a new catalogue scope — restart pagination.
    setPage(1);
  }, [activeCollection]);

  // Graceful fallback for legacy/unknown category slugs (taxonomy changed):
  // if the first path segment isn't a known department, resolve to the
  // catalogue root instead of showing an empty/broken page.
  useEffect(() => {
    if (path.length && !['instore-products', 'extended-range'].includes(path[0]) && !categories.some((c) => c.id === path[0])) {
      hashNavigate([]);
    }
  }, [path, hashNavigate, categories]);

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
  }, [path, pathKey, categories, customer?.id]);

  useEffect(() => {
    if (!customer?.id) {
      setLastOrder(null);
      setOrderHistoryAvailable(true);
      setOrderHistoryResolved(true);
      return undefined;
    }

    let cancelled = false;
    setLastOrder(null);
    setOrderHistoryAvailable(false);
    setOrderHistoryResolved(false);
    fetchLastOrder(customer.id)
      .then((order) => {
        if (cancelled) return;
        setLastOrder(order);
        setOrderHistoryAvailable(true);
      })
      .catch(() => {
        if (!cancelled) setOrderHistoryAvailable(false);
      })
      .finally(() => { if (!cancelled) setOrderHistoryResolved(true); });
    return () => { cancelled = true; };
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
    const refreshCatalogue = () => {
      void refreshProductCache().catch(() => {
        // Keep the last known-good catalogue visible during a transient outage.
      });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshCatalogue();
    };
    const interval = window.setInterval(refreshWhenVisible, 5 * 60_000);

    window.addEventListener('focus', refreshCatalogue);
    window.addEventListener('online', refreshCatalogue);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshCatalogue);
      window.removeEventListener('online', refreshCatalogue);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
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
      setCatalogError(false);
      try {
        const specialIds = activeCollection === 'specials' ? new Set(Object.keys(specialsMap)) : null;
        const pageData = await withDeadline(() => fetchProductPage({
          page,
          pageSize: CATALOG_PAGE_SIZE,
          searchQuery,
          categoryPath: path,
          collection: activeCollection,
          sort,
          specialIds,
          inStockOnly,
        }), { timeoutMs: 20_000 });

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
          const l1Data = await withDeadline(() => fetchProductPage({
            page: 1,
            pageSize: CATALOG_PAGE_SIZE,
            searchQuery: '',
            categoryPath: path.slice(0, 1),
            collection: 'all',
            sort,
            inStockOnly,
          }), { timeoutMs: 20_000 });
          if (!cancelled && l1Data.total > 0) {
            setCatalogProducts(l1Data.products);
            setCatalogTotal(l1Data.total);
            setCatalogResultQuery(searchQuery);
            warmPageImages(l1Data.products);
            return;
          }
        }

        setCatalogProducts(pageData.products);
        setCatalogTotal(pageData.total);
        setCatalogResultQuery(searchQuery);
        warmPageImages(pageData.products);
      } catch {
        // Never fall back to a public catalogue file: trade pricing and stock
        // are available only through the approved-customer API.
        if (cancelled) return;
        setCatalogError(true);
        setUsingFallback(false);
        setCatalogTotal(0);
        setCatalogProducts([]);
        setCatalogResultQuery(searchQuery);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (cancelDeferredImageWarm) cancelDeferredImageWarm();
    };
  }, [activeCollection, page, path, searchQuery, sort, categories, inStockOnly, catalogRefreshKey, specialsMap]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!instoreAvailable || query.length < 2) {
      setInstoreSearch({ query: '', products: [], total: 0, loading: false, error: false });
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setInstoreSearch({ query, products: [], total: 0, loading: true, error: false });
    const timer = window.setTimeout(async () => {
      try {
        const catalogue = instoreCatalogue();
        const result = catalogue
          ? instorePage(catalogue, { query, pageSize: 12 })
          : await fetchExtendedRange(query, { signal: controller.signal, page: 1 });
        if (!cancelled) setInstoreSearch({
          query,
          products: (result.products || []).slice(0, 12),
          total: Number(result.total) || 0,
          loading: false,
          error: false,
        });
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setInstoreSearch({ query, products: [], total: 0, loading: false, error: true });
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!routeSearchQuery.trim()) {
      searchTrackRef.current = { rowId: null, searchedAt: null, term: '' };
      lastSearchLogKeyRef.current = '';
      return;
    }
    if (catalogueResultsPending || catalogError) return;

    const term = routeSearchQuery.trim();
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
        resultsFound: visibleCatalogResults.total,
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
  }, [routeSearchQuery, visibleCatalogResults.total, catalogueResultsPending, catalogError, activeCollection, path, pathKey, customer?.id, customer?.email]);

  const rawBreadcrumb = buildBreadcrumb(categories, path);
  const breadcrumb = rawBreadcrumb.length > 0 ? rawBreadcrumb
    : path.map((seg, i) => ({ label: seg, path: path.slice(0, i + 1) }));
  const recommendationProducts = useMemo(() => visibleCatalogResults.products.slice(0, 4), [visibleCatalogResults.products]);

  // Resolve the category node for the current path (used by CategoryLanding)
  const categoryNode = useMemo(() => {
    if (!path.length) return null;
    let node = categories.find((c) => c.id === path[0]) || null;
    for (let i = 1; i < path.length && node; i++) {
      node = (node.children || []).find((c) => c.id === path[i]) || null;
    }
    return node;
  }, [path, categories]);

  const [modalOpen, setModalOpen] = useState(false);
  const [orderStatus, setOrderStatus] = useState('idle');
  const [orderError, setOrderError] = useState('');
  const [orderChanges, setOrderChanges] = useState([]);
  const [submittedOrderNumber, setSubmittedOrderNumber] = useState('');

  useEffect(() => {
    pendingCheckoutRef.current = null;
    setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
    pendingCheckoutStorageErrorRef.current = null;
    checkoutRefRef.current = null;
    lastCheckoutOptionsRef.current = null;
    lastCheckoutSubmissionRef.current = null;
    checkoutSendingRef.current = false;
    acceptedCheckoutAttemptRef.current = null;
    confirmedCheckoutCleanupRef.current = null;
    setPendingRequestSummary(null);
    setRecoveryReceiptDurable(true);
    setOrderRecoveryNote('');
    if (!customer?.id) return;
    try {
      const pending = readPendingCheckout(localStorage, customer.id);
      if (!pending) return;
      pendingCheckoutRef.current = pending;
      setPendingRequestSummary(savedCheckoutSummary(pending));
      checkoutRefRef.current = pending.payload.clientRef;
      lastCheckoutOptionsRef.current = pending.options;
      lastCheckoutSubmissionRef.current = pending;
      setOrderStatus('error');
      setOrderError(pending.result
        ? 'Your saved request has a receipt. Check the saved request to confirm it on your account. Your current basket will be kept.'
        : 'An earlier order request needs confirmation. Check the saved request before ordering again. Your current basket will be kept.');
      setOrderChanges(pending.reviewChanges || []);
      setModalOpen(true);
    } catch (error) {
      pendingCheckoutStorageErrorRef.current = error;
      setOrderStatus('error');
      setOrderError(error.message);
      setOrderChanges([]);
      setModalOpen(true);
    }
  }, [customer?.id]);

  useEffect(() => () => {
    if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
    if (cartSyncTimerRef.current) window.clearTimeout(cartSyncTimerRef.current);
  }, []);

  const shoppingCartIntent = useRef(false);
  const markCartActivity = useCallback(() => {
    shoppingCartIntent.current = true;
    const now = Date.now();
    setCartLastActivityAt(now);
    setCartClock(now);
    try { localStorage.setItem(CART_LAST_ACTIVITY_KEY, String(now)); } catch { /* ignore */ }
  }, []);

  const clearCart = useCallback(({ allowUndo = true, intent = 'normal' } = {}) => {
    if (!cartHydratedRef.current || (intent === 'normal' && !canChangeBasket())) return;
    const clearedAt = Date.now();
    if (intent === 'normal' && !cartPreviewModeRef.current) {
      const accountId = cartAccountRef.current;
      const existing = readPendingCart(localStorage, accountId);
      const operation = makeCartSyncOperation(accountId, [], clearedAt, clearedAt, intent);
      if (!keepPendingCart(accountId, operation, existing?.baseRevision ?? cartRevisionRef.current)) {
        setCartAnnouncement('Your basket was kept because this browser could not safely save the clear request. Restore browser storage, then try Clear again.');
        return false;
      }
    }
    shoppingCartIntent.current = intent === 'normal';
    if (allowUndo && cartItems.length) {
      setClearedCartSnapshot({
        accountId: cartAccountRef.current,
        items: cartItems.map((item) => ({ ...item })),
        clearedAt,
      });
      trackJourneyEvent('basket_cleared', {
        journey: 'basket',
        step: 'clear',
        outcome: 'success',
        metadata: { line_count: cartItems.length },
      });
    } else {
      setClearedCartSnapshot(null);
    }
    cartClearIntentRef.current = intent;
    cartClearActivityAtRef.current = clearedAt;
    cartUndoTokenRef.current = clearedAt;
    setCartItems([]);
    setCartLastActivityAt(null);
    currentCartRef.current = { items: [], activityAt: clearedAt };
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(CART_LAST_ACTIVITY_KEY);
    } catch { /* ignore */ }
  }, [cartItems, keepPendingCart, canChangeBasket]);

  const undoClearCart = useCallback(() => {
    if (!canChangeBasket()) return false;
    const snapshot = clearedCartSnapshot;
    const belongsToAccount = snapshot?.accountId === cartAccountRef.current;
    const stillSameClear = snapshot?.clearedAt === cartUndoTokenRef.current;
    if (!snapshot || !belongsToAccount || !stillSameClear || currentCartRef.current.items.length) {
      setClearedCartSnapshot(null);
      setCartAnnouncement('This basket changed on another device and could not be restored.');
      return false;
    }
    const restoredAt = Date.now();
    const restoredItems = snapshot.items.map((item) => ({ ...item }));
    cartClearActivityAtRef.current = null;
    cartUndoTokenRef.current = null;
    cartClearIntentRef.current = 'normal';
    cartRestoreFingerprintRef.current = cartFingerprint(restoredItems);
    setCartItems(restoredItems);
    setCartLastActivityAt(restoredAt);
    currentCartRef.current = { items: restoredItems, activityAt: restoredAt };
    try { localStorage.setItem(CART_LAST_ACTIVITY_KEY, String(restoredAt)); } catch { /* ignore */ }
    setClearedCartSnapshot(null);
    setCartAnnouncement(`Order restored. ${restoredItems.length} product line${restoredItems.length === 1 ? '' : 's'}.`);
    trackJourneyEvent('basket_restored', {
      journey: 'basket',
      step: 'undo_clear',
      outcome: 'success',
      metadata: { line_count: restoredItems.length },
    });
    return true;
  }, [clearedCartSnapshot, canChangeBasket]);

  useEffect(() => {
    if (!clearedCartSnapshot) return undefined;
    const timeout = window.setTimeout(() => setClearedCartSnapshot(null), 30_000);
    return () => window.clearTimeout(timeout);
  }, [clearedCartSnapshot]);

  const addToCart = useCallback((product, qty, buttonPos = null, preference = undefined, sourceHint = null) => {
    product = freshCartProduct(product, sourceHint || (product.isExtendedRange === true ? 'instore' : 'main'));
    if (!canChangeBasket()) {
      setCartAnnouncement('Your account basket is still loading. Please try again in a moment.');
      return;
    }
    const maxQty = cartQtyCapForProduct(product);
    if (maxQty <= 0) return;
    const minimumQty = Math.max(1, Math.min(9999, Math.floor(Number(product?.minQty) || 1)));
    if (maxQty < minimumQty) {
      setCartAnnouncement(`Only ${maxQty} available for ${product.name}; its minimum order is ${minimumQty}.`);
      return;
    }
    const requestedQty = Math.max(minimumQty, normalizeCartQtyInput(qty));
    const requestedPreference = typeof preference === 'string' ? normalizeItemPreference(preference) : undefined;
    const incomingLine = { product, qty: requestedQty, ...itemPreferenceFields({ preference: requestedPreference }) };
    setCartItems((prev) => addBasketLine(prev, incomingLine, {
      quantityCapForProduct: cartQtyCapForProduct, maxLines: MAX_CART_LINES,
    }).items);
    markCartActivity();
    cartRevealSequenceRef.current += 1;
    setCartRevealRequest({ lineKey: basketLineKey(incomingLine), token: cartRevealSequenceRef.current });

    // Engagement capture for the admin dashboard. Privacy-safe by design: the
    // quantity is a number and nothing identifies the product, matching the
    // rest of the journey log. Fire-and-forget — analytics must never delay
    // adding to a basket.
    trackJourneyEvent('cart_item_added', {
      journey: 'basket',
      metadata: { qty: Math.min(maxQty, requestedQty) },
    });

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
  }, [markCartActivity, searchQuery, canChangeBasket]);

  const handleCartRevealHandled = useCallback((token) => {
    setCartRevealRequest((current) => (current?.token === token ? null : current));
  }, []);

  const handleCartScrollPositionChange = useCallback((scrollTop) => {
    setCartScrollTop(scrollTop);
  }, []);

  const updateQty = useCallback((lineKey, qty) => {
    if (!canChangeBasket()) return;
    const requestedQty = normalizeCartQtyInput(qty);
    setCartItems((prev) => updateBasketLineQuantity(prev, lineKey, requestedQty, cartQtyCapForProduct));
    markCartActivity();
  }, [markCartActivity, canChangeBasket]);

  const removeFromCart = useCallback((lineKey) => {
    if (!canChangeBasket()) return;
    setCartItems((prev) => removeBasketLine(prev, lineKey));
    markCartActivity();
  }, [markCartActivity, canChangeBasket]);

  const cartQtyMap = useMemo(() => {
    const map = {};
    const totals = new Map();
    for (const item of cartItems) {
      const key = basketProductKey(item.product);
      totals.set(key, (totals.get(key) || 0) + item.qty);
    }
    for (const item of cartItems) map[item.product.id] = totals.get(basketProductKey(item.product));
    return map;
  }, [cartItems]);

  const cartPreferenceMap = useMemo(() => {
    const map = {};
    for (const item of cartItems) map[item.product.id] = item.preference || '';
    return map;
  }, [cartItems]);

  const handleCartQtyChange = useCallback((product, newQty) => {
    const lineKey = basketLineKey({ product });
    if (newQty <= 0) removeFromCart(lineKey);
    else updateQty(lineKey, newQty);
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

  useEffect(() => {
    if (!customer?.id || !cartHydrated || !orderHistoryResolved) return;
    const journeyKey = `${customer.id}:${loginSessionKey}`;
    if (journeyAccountRef.current === journeyKey) return;
    journeyAccountRef.current = journeyKey;

    if (hasShownJourneyThisLogin(customer.id, loginSessionKey)) {
      setCustomerJourney(null);
      setJourneyReady(true);
      return;
    }

    const firstPortalLogin = isExplicitFirstPortalLogin(customer);
    const restoredBasketIsUntouched = loginBasketSnapshot?.accountId === customer.id
      && loginBasketSnapshot.itemCount > 0
      && loginBasketSnapshot.fingerprint === cartFingerprint(cartItems);
    const showInstoreIntro = false; // Replaced by the independent search tip.
    const nextJourney = selectCustomerDashboardState({
      firstName: customerFirstName(customer),
      firstLogin: firstPortalLogin,
      onlineOrderCount: lastOrder ? 1 : 0,
      orderHistoryAvailable,
      basketRestoredAtLogin: restoredBasketIsUntouched,
      basketItemCount: restoredBasketIsUntouched ? loginBasketSnapshot.itemCount : 0,
      basketTotalInclVat: restoredBasketIsUntouched ? loginBasketSnapshot.totalInclVat : null,
      showInstoreIntro,
    });
    setCustomerJourney(nextJourney);
    setJourneyReady(true);
    rememberJourneyThisLogin(customer.id, loginSessionKey);
    if (firstPortalLogin) {
      void markPortalWelcomeSeen().catch(() => {
        // Keep the server value null so the customer gets one more chance on
        // their next authenticated login instead of silently losing welcome.
      });
    }
  }, [
    cartHydrated,
    customer,
    cartItems,
    lastOrder,
    loginBasketSnapshot,
    loginSessionKey,
    orderHistoryAvailable,
    orderHistoryResolved,
  ]);

  const journeyDismissTimerRef = useRef(null);

  const dismissCustomerJourney = useCallback((event, { animate = false } = {}) => {
    const restoreCartFocus = customerJourney?.presentation === 'basket' && (
      event?.key === 'Escape'
      || event?.currentTarget?.classList?.contains('customer-journey-prompt__close')
    );

    const finishDismissal = () => {
      journeyDismissTimerRef.current = null;
      setCustomerJourney(null);
      if (!restoreCartFocus) return;
      window.requestAnimationFrame(() => {
        document.querySelector(
          window.innerWidth <= 900
            ? '[data-cart-trigger="mobile"]'
            : '[data-cart-trigger="desktop"]',
        )?.focus();
      });
    };

    if (!animate) {
      if (journeyDismissTimerRef.current) window.clearTimeout(journeyDismissTimerRef.current);
      finishDismissal();
      return;
    }

    setCustomerJourney((current) => {
      if (!current || current.dismissing) return current;
      return { ...current, dismissing: true };
    });
    if (journeyDismissTimerRef.current) window.clearTimeout(journeyDismissTimerRef.current);
    journeyDismissTimerRef.current = window.setTimeout(finishDismissal, CUSTOMER_JOURNEY_EXIT_MS);
  }, [customerJourney?.presentation]);

  useEffect(() => () => {
    if (journeyDismissTimerRef.current) window.clearTimeout(journeyDismissTimerRef.current);
  }, []);

  useEffect(() => {
    if (!customerJourney || !Number.isFinite(customerJourney.dismissAfterMs)) return undefined;
    const timer = window.setTimeout(dismissCustomerJourney, customerJourney.dismissAfterMs);
    return () => window.clearTimeout(timer);
  }, [customerJourney, dismissCustomerJourney]);

  useEffect(() => {
    if (!customerJourney) return undefined;
    const dismissAfterOutsideInteraction = (event) => {
      if (event.target?.closest?.('.customer-journey-prompt')) return;
      dismissCustomerJourney();
    };
    window.addEventListener('pointerdown', dismissAfterOutsideInteraction, { passive: true });
    return () => window.removeEventListener('pointerdown', dismissAfterOutsideInteraction);
  }, [customerJourney, dismissCustomerJourney]);

  useEffect(() => {
    if (customerJourney?.presentation !== 'basket' || customerJourney.dismissing) return undefined;

    const targets = [window, document.querySelector('.content-area')].filter(Boolean);
    const initialPositions = new Map(targets.map((target) => [
      target,
      target === window
        ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
        : target.scrollTop,
    ]));
    const dismissAfterMeaningfulScroll = (event) => {
      const target = event.currentTarget;
      const currentPosition = target === window
        ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
        : target.scrollTop;
      if (Math.abs(currentPosition - (initialPositions.get(target) || 0)) < BASKET_REMINDER_SCROLL_DISMISS_PX) return;
      dismissCustomerJourney(null, { animate: true });
    };

    targets.forEach((target) => target.addEventListener('scroll', dismissAfterMeaningfulScroll, { passive: true }));
    return () => targets.forEach((target) => target.removeEventListener('scroll', dismissAfterMeaningfulScroll));
  }, [customerJourney?.dismissing, customerJourney?.presentation, dismissCustomerJourney]);

  useEffect(() => {
    if (customerJourney?.presentation !== 'basket' || customerJourney.dismissing) return;
    if (!loginBasketSnapshot?.fingerprint) return;
    if (cartFingerprint(cartItems) === loginBasketSnapshot.fingerprint) return;
    dismissCustomerJourney(null, { animate: true });
  }, [cartItems, customerJourney?.dismissing, customerJourney?.presentation, dismissCustomerJourney, loginBasketSnapshot]);

  const handleCustomerJourneyPrimary = useCallback((event) => {
    if (customerJourney?.presentation === 'basket') handleCartOpen(event);
    else if (customerJourney?.action === 'instore') hashNavigate(['instore-products']);
    else goHome();
    dismissCustomerJourney();
  }, [customerJourney, dismissCustomerJourney, goHome, handleCartOpen, hashNavigate]);

  const handleCustomerJourneyInstore = useCallback(() => {
    hashNavigate(['instore-products']);
    dismissCustomerJourney();
  }, [dismissCustomerJourney, hashNavigate]);

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

  const sendOrderEmail = async (opts = {}, retryPending = false) => {
    if (checkoutSendingRef.current || !cartHydratedRef.current) return { ok: false };
    const accountId = customer?.id;
    const identity = captureAuthIdentity();
    const ownsAccount = () => captureAuthIdentity() === identity && identity.userId === accountId && cartAccountRef.current === accountId;
    if (!accountId || !ownsAccount()) return { ok: false };
    if (cartPreviewModeRef.current) {
      setCartAnnouncement('Preview basket only - order requests are disabled here.');
      return { ok: false, preview: true };
    }
    checkoutSendingRef.current = true;
    try {
      return await withPendingCheckoutLock(navigator.locks, accountId, async () => {
        assertAuthIdentity(identity);
        if (!ownsAccount()) return { ok: false };
        let pending = readPendingCheckout(localStorage, accountId);
        pendingCheckoutRef.current = pending;
        setPendingRequestSummary(savedCheckoutSummary(pending));
        pendingCheckoutStorageErrorRef.current = null;
        const amendment = pending?.confirmedRejectedBeforeCapture === true && !retryPending;
        if (pending && !retryPending && !amendment) {
          const error = new Error('Your earlier order request still needs confirmation. Check the saved request, or check My Orders and contact Proto before sending another order.');
          throw error;
        }
        const replay = Boolean(pending && !amendment);
        const checkoutOptions = pending ? pending.options : opts;
        const courierChoice = checkoutOptions?.courierChoice || null;
        const customerNotes = String(checkoutOptions?.customerNotes || '').trim();
        const deliveryMethod = courierChoice === 'own' ? "Customer's own courier"
          : courierChoice === 'proto' ? 'Proto Trading delivers'
            : courierChoice === 'pickup' ? 'In store pick up' : null;
        if (!deliveryMethod) {
          trackJourneyEvent('checkout_validation_failed', { journey: 'checkout', step: 'delivery', outcome: 'error',
            metadata: { error_code: 'delivery_required' } });
          const error = new Error('Please choose a delivery option before submitting.');
          error.code = 'delivery_required';
          throw error;
        }
        const submittedItems = replay ? pending.items
          : currentCartRef.current.items.map(item => ({ ...item, product: { ...item.product } }));
        if (!submittedItems.length) return { ok: false };
        if (!replay && cartProductsNeedReview(submittedItems)) throw new Error(CART_PRODUCT_REVIEW_MESSAGE);
        const submittedTotal = replay ? pending.total
          : submittedItems.reduce((sum, item) => sum + Number(item.product.price) * item.qty, 0);
        const submittedFingerprint = cartFingerprint(submittedItems);
        if (!replay) {
          if (cartConflictRef.current || cartSyncInFlightRef.current || pendingCartSyncRef.current
            || cartSyncStatus !== 'saved' || submittedFingerprint !== lastSavedCartRef.current) {
            throw new Error('Please confirm account basket sync before submitting this order. Your items are kept.');
          }
          const beforeJournal = pendingJournalRef.current.raw;
          const remote = await getAccountCart();
          assertAuthIdentity(identity);
          if (!ownsAccount()) return { ok: false };
          assertPendingSnapshot(accountId, beforeJournal);
          if (cartSyncInFlightRef.current || pendingCartSyncRef.current
            || cartFingerprint(currentCartRef.current.items) !== submittedFingerprint
            || remote.revision !== cartRevisionRef.current || cartFingerprint(remote.items) !== submittedFingerprint) {
            throw new Error('Your saved account basket changed. Refresh and review it before submitting. Your items are kept.');
          }
        }
        checkoutRefRef.current = pending?.payload.clientRef || null;
        if (!checkoutRefRef.current) checkoutRefRef.current = makeClientRef();
        const payload = replay ? pending.payload : {
          clientRef: checkoutRefRef.current,
          promoCode: checkoutOptions.promo?.code || null,
          deliveryMethod,
          customerNotes,
          items: submittedItems.map(item => ({
            qty: item.qty, ...itemPreferenceFields(item),
            product: {
              id: item.product.id, sku: item.product.sku, code: item.product.code,
              name: item.product.name, source: item.product.source,
              isExtendedRange: item.product.isExtendedRange === true,
              checkoutSnapshot: checkoutSnapshotForProduct(item.product),
            },
          })),
        };
        let intent = replay ? verifyPendingCheckout(localStorage, pending)
          : writePendingCheckout(localStorage, accountId, {
            ...(pending || {}), version: 1, customerId: accountId, payload,
            items: submittedItems, total: submittedTotal, fingerprint: submittedFingerprint, options: checkoutOptions,
          });
        pendingCheckoutRef.current = intent;
        setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
        lastCheckoutOptionsRef.current = checkoutOptions;
        lastCheckoutSubmissionRef.current = { items: submittedItems, total: submittedTotal, fingerprint: submittedFingerprint };
        setOrderStatus('sending');
        setOrderError('');
        setOrderChanges([]);
        setSubmittedOrderNumber('');
        setOrderRecoveryNote('');
        setModalOpen(true);
        trackJourneyEvent('checkout_started', { journey: 'checkout', step: 'submit', outcome: 'started',
          metadata: { line_count: submittedItems.length, retry: Boolean(pending), delivery_method: courierChoice } });
        let result = intent.result;
        if (!result) {
          const sendHeaders = await withDeadline(() => authHeaders(), { timeoutMs: 10_000 });
          assertAuthIdentity(identity);
          if (!ownsAccount()) return { ok: false };
          intent = recordPendingCheckoutDispatch(localStorage, intent);
          pendingCheckoutRef.current = intent;
          setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
          verifyPendingCheckout(localStorage, intent);
          try {
            result = await requestJson('/api/send-order', {
              method: 'POST', headers: sendHeaders, body: JSON.stringify(intent.payload),
            }, { timeoutMs: 65_000,
              message: 'We could not confirm whether your order was received. Your basket is saved. Use Retry to check this same order request.' });
          } catch (error) {
            assertAuthIdentity(identity);
            if (!ownsAccount()) return { ok: false };
            if (error.code === 'ORDER_REVIEW_REQUIRED'
              || (error.code === 'ORDER_PRODUCT_UNAVAILABLE' && error.status === 400
                && error.data?.rejectedBeforeCapture === true)) {
              const changes = Array.isArray(error.changes) ? error.changes : [];
              pendingCheckoutRef.current = recordPendingCheckoutReview(localStorage, intent, changes);
              setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
              // Only the first definitive rejection can authorize an amendment.
              // A later review after an uncertain dispatch keeps exact replay.
              if (pendingCheckoutRef.current.confirmedRejectedBeforeCapture
                && submittedBasketStillCurrent(intent, cartFingerprint(currentCartRef.current.items))) {
                setCartItems(previous => previous.map(item => {
                  const change = changes.find(candidate => {
                    const key = String(candidate?.sku || '').toUpperCase();
                    return key && [item.product.id, item.product.sku, item.product.code]
                      .some(value => String(value || '').toUpperCase() === key);
                  });
                  if (!change) return item;
                  return { ...item, product: { ...item.product,
                    ...(Number.isFinite(change.currentPrice) ? { price: change.currentPrice } : {}),
                    ...(Number.isFinite(change.currentStockQty)
                      ? { stockOnHand: change.currentStockQty, stockQty: change.currentStockQty } : {}),
                  } };
                }));
                setOrderChanges(changes);
              } else {
                error.message = 'This earlier request has an uncertain outcome. Its original basket and reference are kept. Check My Orders or contact Proto before changing the request.';
                setOrderChanges([]);
              }
            }
            throw error;
          }
        }
        assertAuthIdentity(identity);
        if (!ownsAccount()) return { ok: false };
        if (result?.success !== true || !result.orderId) {
          const error = new Error('We could not confirm whether your order was received. Check the saved request, or check My Orders before sending another order.');
          error.code = 'INVALID_RESPONSE';
          throw error;
        }
        acceptedCheckoutAttemptRef.current = { ...intent, result, raw: intent.raw };
        let acceptanceStored = true;
        try {
          intent = acceptPendingCheckout(localStorage, intent, result);
          pendingCheckoutRef.current = intent;
          setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
          acceptedCheckoutAttemptRef.current = intent;
        } catch {
          // The POST succeeded. A denied promotion must never turn its receipt
          // into a retryable failure or replace the original durable reference.
          acceptanceStored = false;
          pendingCheckoutRef.current = { ...intent, result };
          setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
          setCartStorageIssue({ code: 'checkout_cleanup', detail: 'Your order was received. This browser could not save its receipt. Keep this page open and retry basket cleanup; do not resubmit.' });
        }
        lastCheckoutSubmissionRef.current = { ...intent, result, receiptIdentity: identity };
        setSubmittedOrderNumber(result.orderNumber || '');
        setOrderStatus(result.emailDeliveryFailed ? 'saved' : 'sent');
        trackShoppingEvent('order_submitted', { orderId: result.orderId || null });
        trackJourneyEvent('order_submit_succeeded', { journey: 'checkout', step: 'submit',
          outcome: result.emailDeliveryFailed ? 'saved_delivery_pending' : 'success',
          metadata: { line_count: submittedItems.length, retry: Boolean(pending), delivery_method: courierChoice } });
        if (submittedBasketStillCurrent(intent, cartFingerprint(currentCartRef.current.items))) {
          clearCart({ allowUndo: false, intent: 'submitted_clear' });
          if (!acceptanceStored) setOrderRecoveryNote('Your order was received. Keep this page open and retry basket cleanup before ordering again.');
        } else {
          setOrderRecoveryNote('Your current basket was kept because it changed. Review the received order, then use Review current basket before submitting another order.');
          setCartAnnouncement('Your earlier order was received. Your newer basket items have been kept. View the order before sending another request.');
        }
        setMobileCartOpen(false);
        setCartDrawerOpen(false);
        if (searchTrackRef.current.rowId) void logSearchOrder({ searchRowId: searchTrackRef.current.rowId,
          orderNumber: result.orderId || '', orderValue: submittedTotal });
        void fetchLastOrder(accountId).then(order => { if (ownsAccount()) setLastOrder(order); }).catch(() => {});
        return { ok: true, result };
      });
    } catch (error) {
      if (!ownsAccount()) return { ok: false };
      setOrderStatus('error');
      setOrderError(error.code === 'ORDER_REFERENCE_CONFLICT'
        ? `${error.message} Check My Orders or contact Proto to resolve this request before placing another order.`
        : error.message || 'Order could not be sent');
      if (error.code !== 'ORDER_REVIEW_REQUIRED') setOrderChanges([]);
      setModalOpen(true);
      trackJourneyEvent('order_submit_failed', { journey: 'checkout', step: 'submit', outcome: 'error',
        metadata: { error_code: error?.code || 'request_failed' } });
      return { ok: false };
    } finally {
      if (ownsAccount()) checkoutSendingRef.current = false;
    }
  };

  const reviewCurrentBasket = async () => {
    const accountId = customer?.id;
    const identity = captureAuthIdentity();
    const ownsAccount = () => captureAuthIdentity() === identity && identity.userId === accountId && cartAccountRef.current === accountId;
    try {
      await withPendingCheckoutLock(navigator.locks, accountId, async () => {
        assertAuthIdentity(identity);
        if (!ownsAccount()) return;
        const attempt = readPendingCheckout(localStorage, accountId);
        if (!attempt || attempt.status !== 'accepted' || !attempt.result
          || cartSyncInFlightRef.current || pendingCartSyncRef.current || cartConflictRef.current
          || localStorage.getItem(`proto_cart_pending_${accountId}`) !== null
          || readPendingCartRecoveryCopies(localStorage, accountId).length) throw new Error('Confirm basket sync and cleanup before reviewing your current basket.');
        const currentFingerprint = cartFingerprint(currentCartRef.current.items);
        if (currentFingerprint === attempt.fingerprint || currentFingerprint !== lastSavedCartRef.current) throw new Error('Finish cleanup of the received order before submitting another request.');
        const remote = await getAccountCart();
        assertAuthIdentity(identity);
        if (!ownsAccount()) return;
        verifyPendingCheckout(localStorage, attempt);
        if (remote.revision !== cartRevisionRef.current || cartFingerprint(remote.items) !== currentFingerprint
          || cartFingerprint(currentCartRef.current.items) !== currentFingerprint || cartSyncInFlightRef.current
          || pendingCartSyncRef.current || localStorage.getItem(`proto_cart_pending_${accountId}`) !== null
          || readPendingCartRecoveryCopies(localStorage, accountId).length) throw new Error('Your saved basket changed. Refresh and review it before continuing.');
        if (!finishPendingCheckout(localStorage, accountId, attempt.payload.clientRef,
          { acknowledgedBasketPreserved: true, currentFingerprint, remoteRevision: remote.revision })) throw new Error('The received order reference could not be cleaned up. Retry cleanup before continuing.');
        pendingCheckoutRef.current = null;
        setPendingRequestSummary(savedCheckoutSummary(pendingCheckoutRef.current));
        acceptedCheckoutAttemptRef.current = null;
        confirmedCheckoutCleanupRef.current = null;
        checkoutRefRef.current = null;
        setOrderRecoveryNote('');
        setModalOpen(false);
        if (window.matchMedia?.('(max-width: 768px)').matches) setMobileCartOpen(true);
        else setCartDrawerOpen(true);
      });
    } catch (error) {
      if (ownsAccount()) setOrderRecoveryNote(error.message);
    }
  };

  const checkSavedRequest = async () => {
    if (checkoutSendingRef.current) return;
    const accountId = customer?.id;
    const identity = captureAuthIdentity();
    const ownsAccount = () => captureAuthIdentity() === identity && identity.userId === accountId && cartAccountRef.current === accountId;
    if (!accountId || !ownsAccount() || cartPreviewModeRef.current) return;
    checkoutSendingRef.current = true;
    setOrderStatus('checking');
    setOrderError('');
    setOrderChanges([]);
    setModalOpen(true);
    try {
      const recovered = await checkSavedCheckout({ storage: localStorage, locks: navigator.locks, accountId, ownsAccount,
        request: async payload => {
          const headers = await withDeadline(() => authHeaders(), { timeoutMs: 10000 });
          assertAuthIdentity(identity);
          if (!ownsAccount()) throw new Error('Your signed-in account changed.');
          return requestJson('/api/checkout-recovery', {
            method: 'POST', headers, body: JSON.stringify(payload),
          }, { timeoutMs: 15000, message: 'The saved request could not be confirmed in time. Your saved request and current basket have been kept.' });
        },
      });
      if (!ownsAccount()) return;
      pendingCheckoutRef.current = recovered.pending;
      setPendingRequestSummary(savedCheckoutSummary(recovered.pending));
      if (recovered.state === 'not_found') {
        setOrderStatus('error');
        setOrderError('No matching received order was found. This does not confirm that it is safe to send again. Your saved request and current basket are kept. Contact Proto with the saved request reference.');
        return;
      }
      acceptedCheckoutAttemptRef.current = recovered.promotionFailed ? null : recovered.pending;
      setRecoveryReceiptDurable(!recovered.promotionFailed);
      lastCheckoutSubmissionRef.current = { ...recovered.pending, result: recovered.result, receiptIdentity: identity };
      setSubmittedOrderNumber(recovered.result.orderNumber);
      setOrderStatus('received');
      setOrderRecoveryNote(recovered.promotionFailed
        ? 'The saved request was received, but this browser could not save the receipt. Your current basket is kept. Do not resubmit. Keep this order reference and contact Proto before continuing. Email and WhatsApp delivery were not checked.'
        : cartFingerprint(currentCartRef.current.items) === recovered.pending.fingerprint
          ? 'Only the saved request was confirmed. This basket matches that received request and has been kept. Do not send it again. Open the confirmed order, or contact Proto before clearing it or starting another order. Email and WhatsApp delivery were not checked.'
          : 'Only the saved request was confirmed. Your current basket has been kept. Email and WhatsApp delivery were not checked. Review the received order before continuing.');
      setCartAnnouncement('Your saved request was confirmed. Your current basket has been kept.');
    } catch (error) {
      if (!ownsAccount()) return;
      setOrderStatus('error');
      setOrderError(`${error.message || 'The saved request could not be confirmed.'} Your saved request and current basket have been kept.`);
    } finally {
      if (ownsAccount()) checkoutSendingRef.current = false;
    }
  };

  const viewSubmittedOrder = () => {
    const identity = captureAuthIdentity();
    const submitted = lastCheckoutSubmissionRef.current;
    const receipt = submitted?.result;
    const received = ['received', 'sent', 'saved'].includes(orderStatus)
      && submitted?.customerId === customer?.id && submitted.receiptIdentity === identity
      && identity.userId === customer?.id && receipt?.success === true
      && typeof receipt.orderId === 'string' && typeof receipt.orderNumber === 'string';
    setModalOpen(false);
    onViewProfile?.(received
      ? { kind: 'received', customerId: customer.id, identity, orderId: receipt.orderId, orderNumber: receipt.orderNumber }
      : { kind: 'unconfirmed', customerId: customer?.id, identity });
  };

  const handleReorder = async (items, { signal } = {}) => {
    const identity = captureAuthIdentity();
    const accountId = customer?.id;
    const held = () => ({ added: 0, missing: [], overflow: 0, held: true,
      message: 'Your basket or account changed while products were loading. No reorder items were added. Review your basket before trying again.' });
    const ownsAction = () => !signal?.aborted && captureAuthIdentity() === identity
      && identity?.userId === accountId && cartAccountRef.current === accountId && cartHydratedRef.current;
    if (!ownsAction() || !canChangeBasket() || cartConflictRef.current || cartSyncInFlightRef.current) return held();
    // Explicit UI completion only: flush queued edits before taking a snapshot.
    // The updater below is pure; acknowledgement happens after React commits.
    flushSync(() => {});
    if (!ownsAction() || !canChangeBasket() || cartConflictRef.current || cartSyncInFlightRef.current) return held();
    const basketBytes = JSON.stringify(currentCartRef.current.items);
    const revision = cartRevisionRef.current;
    const journalRaw = pendingJournalRef.current.raw;
    const checkoutRaw = pendingCheckoutRef.current?.raw;
    const optionsBytes = JSON.stringify(lastCheckoutOptionsRef.current);
    const activityAt = currentCartRef.current.activityAt;
    // Look products up by SKU through the API, NOT in catalogProducts — that is
    // only the current 60-product page, narrowed further by the active
    // category/search/in-stock filter. Matching against it meant a large
    // reorder silently added whatever happened to be on screen and dropped the
    // rest: a 160-line order added a handful of items with no error shown.
    const mainItems = items.filter(item => knownCartProductSource(item.product || item) === 'main');
    const instoreItems = items.filter(item => knownCartProductSource(item.product || item) === 'instore');
    const [bySku, instoreBySku] = await Promise.all([
      fetchProductsBySkus(mainItems.map((item) => item.productId || item.code)),
      instoreItems.length ? fetchInstoreProductsBySkus(instoreItems.map(item => item.productId || item.code), { signal }) : new Map(),
    ]);

    flushSync(() => {});
    if (!ownsAction() || !canChangeBasket() || cartRevisionRef.current !== revision
      || cartConflictRef.current || cartSyncInFlightRef.current
      || pendingJournalRef.current.raw !== journalRaw || pendingCheckoutRef.current?.raw !== checkoutRaw
      || JSON.stringify(lastCheckoutOptionsRef.current) !== optionsBytes
      || currentCartRef.current.activityAt !== activityAt
      || JSON.stringify(currentCartRef.current.items) !== basketBytes) return held();
    const resolved = [];
    const missing = [];
    for (const item of items) {
      const source = knownCartProductSource(item.product || item);
      const product = source === 'instore' ? instoreBySku.get(String(item.productId || item.code || '').trim().toUpperCase())
        : source === 'main' ? bySku.get(String(item.productId || '').trim().toUpperCase())
          || bySku.get(String(item.code || '').trim().toUpperCase()) : null;
      const verified = verifiedReorderProduct(item, product, source);
      if (verified) resolved.push({ product: verified, qty: item.qty, ...itemPreferenceFields(item) });
      else missing.push(product || !source ? { ...item, reason: 'source_review_required' } : item);
    }

    // Build the next cart OUTSIDE the state updater. Deriving the counts inside
    // it would be unreliable — React may run the updater later, or twice in
    // StrictMode, so `added`/`overflow` could be wrong or double-counted in the
    // message shown to the customer.
    let nextCart = mergeBasketLines(currentCartRef.current.items);
    let added = 0;
    let overflow = 0;
    for (const item of resolved) {
      const result = addBasketLine(nextCart, item, {
        quantityCapForProduct: cartQtyCapForProduct, maxLines: MAX_CART_LINES,
      });
      nextCart = result.items;
      if (result.addedQty > 0) added += 1;
      if (result.reason === 'line_limit') overflow += 1;
      else if (result.addedQty < Number(item.qty)) missing.push({
        ...item, productId: item.product.id, reason: 'stock_limit',
      });
    }

    if (added) {
      // A queued edit may reach React before this update even if the live ref
      // has not published it. Compare actual previous state, never overwrite it.
      flushSync(() => setCartItems(previous => JSON.stringify(previous) === basketBytes ? nextCart : previous));
      if (!ownsAction() || currentCartRef.current.items !== nextCart) return held();
      markCartActivity();
    }

    // The modal stays open when something could not be added, so the customer
    // sees which lines are no longer available rather than assuming the whole
    // order went back in the cart.
    if (!missing.length && !overflow) setReorderModal(false);
    return { added, missing, overflow };
  };

  useEffect(() => {
    if (!requestedReorder) return;
    setLastOrder(requestedReorder);
    setReorderModal(true);
    onRequestedReorderHandled?.();
  }, [requestedReorder, onRequestedReorderHandled]);

  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewOptionsFirst, setPreviewOptionsFirst] = useState(false);
  const productDetailKey = String(refinements.product || '').trim();
  const previewProductKey = productDetailId(previewProduct);

  const handleProductPreview = useCallback((product, { focusOptions = false } = {}) => {
    setPreviewOptionsFirst(Boolean(focusOptions));
    setPreviewProduct(product);
    const id = productDetailId(product);
    if (id) hashNavigate(path, { ...refinements, product: id }, { scroll: false });
  }, [hashNavigate, path, refinements]);

  const closeProductPreview = useCallback(() => {
    setPreviewProduct(null);
    setPreviewOptionsFirst(false);
    if (!refinements.product) return;
    const next = { ...refinements };
    delete next.product;
    hashNavigate(path, next, { scroll: false, replace: true });
  }, [hashNavigate, path, refinements]);

  useEffect(() => {
    if (!productDetailKey) {
      if (previewProductKey) setPreviewProduct(null);
      setPreviewOptionsFirst(false);
      return undefined;
    }
    if (previewProductKey === productDetailKey) return undefined;

    const visible = visibleCatalogResults.products.find((product) => productDetailId(product) === productDetailKey);
    if (visible) {
      setPreviewProduct(visible);
      return undefined;
    }

    let cancelled = false;
    void fetchProductsBySkus([productDetailKey]).then((products) => {
      if (cancelled) return;
      const product = products.get(productDetailKey.toUpperCase()) || null;
      setPreviewProduct(product);
      if (!product) {
        const next = { ...refinements };
        delete next.product;
        setCartAnnouncement('That product is no longer available in the catalogue.');
        hashNavigate(path, next, { scroll: false, replace: true });
      }
    });
    return () => { cancelled = true; };
  }, [visibleCatalogResults.products, hashNavigate, path, previewProductKey, productDetailKey, refinements]);

  const handleSearchProductClick = useCallback((product, index) => {
    trackShoppingProduct('search_result_clicked', product, { position: index + 1 + (page - 1) * CATALOG_PAGE_SIZE });
    const track = searchTrackRef.current;
    if (!track.rowId || !searchQuery.trim()) return;
    void logSearchClick({
      searchRowId: track.rowId,
      clickedSku: product.code || product.id,
      position: index + 1 + (page - 1) * CATALOG_PAGE_SIZE,
      searchedAt: track.searchedAt,
    });
  }, [searchQuery, page]);

  const totalPages = Math.max(1, Math.ceil(visibleCatalogResults.total / CATALOG_PAGE_SIZE));
  const desktopDrawerVisible = cartDrawerOpen || drawerPeek;
  const viewingInstoreProducts = ['instore-products', 'extended-range'].includes(path[0]);
  const instoreRouteQuery = instoreSearchQueryFromRefinements(refinements);
  const instoreRoutePage = instorePageFromRefinements(refinements);
  const shoppingBrowseKey = useRef('');
  const shoppingSearchKey = useRef('');
  const previousShoppingBasket = useRef(null);
  const shoppingCheckoutBasket = useRef(null);
  const trackCheckoutReview = useCallback(() => {
    if (!customer?.id || !cartHydrated || !cartItems.length) return;
    const key = cartFingerprint(cartItems);
    if (shoppingCheckoutBasket.current === key) return;
    shoppingCheckoutBasket.current = key;
    trackShoppingEvent('checkout_started', { metadata: { reason: 'review_opened' } });
  }, [customer?.id, cartHydrated, cartItems]);
  const shoppingAccount = useRef(null);
  useEffect(() => {
    if (shoppingAccount.current === customer?.id) return;
    shoppingAccount.current = customer?.id;
    shoppingBrowseKey.current = ''; shoppingSearchKey.current = ''; previousShoppingBasket.current = null; shoppingCheckoutBasket.current = null;
    clearShoppingSearch('main'); clearShoppingSearch('instore');
  }, [customer?.id]);
  useEffect(() => {
    if (!customer?.id || viewingInstoreProducts) return;
    const key = JSON.stringify([pathKey, activeCollection]);
    if (shoppingBrowseKey.current === key) return;
    shoppingBrowseKey.current = key;
    trackCatalogueVisit(customer.id, 'main', { collection: activeCollection });
    if (path.length) trackShoppingEvent('department_viewed', {
      source: 'main', metadata: { department: path.join('/'), collection: activeCollection },
    });
  }, [customer?.id, pathKey, activeCollection, viewingInstoreProducts, path]);
  useEffect(() => {
    // A new submitted query cannot inherit attribution from the previous one.
    // The Instore page owns its independent query lifecycle.
    clearShoppingSearch('main');
    if (!viewingInstoreProducts) clearShoppingSearch('instore');
    shoppingSearchKey.current = '';
  }, [routeSearchQuery, pathKey, activeCollection, viewingInstoreProducts]);
  useEffect(() => {
    if (!customer?.id || viewingInstoreProducts) return;
    const term = routeSearchQuery.trim();
    if (!term) { shoppingSearchKey.current = ''; clearShoppingSearch('main'); clearShoppingSearch('instore'); return; }
    // Count completed successful results, never loading or failed requests as zero results.
    if (catalogueResultsPending || catalogError || visibleInstoreSearch.loading || visibleInstoreSearch.error) return;
    const key = JSON.stringify([term, pathKey, activeCollection]);
    if (shoppingSearchKey.current === key) return;
    const timer = window.setTimeout(() => {
      shoppingSearchKey.current = key;
      trackShoppingSearch({ source: 'main', searchTerm: term.slice(0, 200), resultsCount: visibleCatalogResults.total + visibleInstoreSearch.total,
        mainResultsCount: visibleCatalogResults.total, instoreResultsCount: visibleInstoreSearch.total,
        metadata: { department: path.join('/'), collection: activeCollection } });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customer?.id, routeSearchQuery, pathKey, path, activeCollection, viewingInstoreProducts, catalogueResultsPending, catalogError, visibleInstoreSearch.loading, visibleInstoreSearch.error, visibleCatalogResults.total, visibleInstoreSearch.total]);
  useEffect(() => {
    if (!customer?.id || !cartHydrated) { previousShoppingBasket.current = null; return; }
    if (!cartItems.length || shoppingCheckoutBasket.current !== cartFingerprint(cartItems)) shoppingCheckoutBasket.current = null;
    const previous = previousShoppingBasket.current;
    const localChange = shoppingCartIntent.current;
    shoppingCartIntent.current = false;
    previousShoppingBasket.current = cartItems;
    if (!localChange || !previous) return;
    for (const change of basketQuantityChanges(previous, cartItems)) {
      trackShoppingProduct(change.eventType, change.product, { quantity: change.quantity });
    }
  }, [customer?.id, cartHydrated, cartItems, cartLastActivityAt]);
  const focusInstoreSearch = useCallback(() => {
    instoreSearchInputRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
    instoreSearchInputRef.current?.focus({ preventScroll: true });
  }, []);
  const viewAllInstoreMatches = useCallback(() => {
    const route = instoreSearchRoute(searchQuery);
    hashNavigate(route.path, route.refinements, { scroll: true });
  }, [hashNavigate, searchQuery]);
  const clearCatalogueSearch = useCallback(() => {
    setSearchQuery('');
    const route = catalogueSearchRoute('');
    hashNavigate(route.path, route.refinements, { scroll: false });
  }, [hashNavigate]);
  const customerJourneyPrompt = customerJourney ? (
    <CustomerJourneyPrompt
      state={customerJourney}
      onPrimary={handleCustomerJourneyPrimary}
      onSecondary={dismissCustomerJourney}
      onInstore={handleCustomerJourneyInstore}
      onDismiss={dismissCustomerJourney}
    />
  ) : null;
  const searchTip = useSearchTip({
    accountId: customer?.id,
    ready: cartHydrated && orderHistoryResolved && journeyReady,
    browsing: path.length === 0 || viewingInstoreProducts,
    searched: Boolean(searchQuery.trim() || instoreRouteQuery.trim()),
    engaged: desktopDrawerVisible || mobileCartOpen || modalOpen || reorderModal || Boolean(previewProduct),
    blocked: Boolean(customerJourney) || showPopup || mobileMenuOpen,
  });
  const focusSearchTip = () => {
    searchTip.dismiss('try_search');
    const input = viewingInstoreProducts
      ? instoreSearchInputRef.current
      : window.innerWidth > 900 ? document.querySelector('.header-search-premium-wrap input') : null;
    if (input) {
      input.scrollIntoView({ block: 'center', behavior: 'auto' });
      input.focus({ preventScroll: true });
    } else {
      document.querySelector('.mobile-tab-bar-btn[aria-label="Search"]')?.click();
    }
  };
  const searchTipPrompt = searchTip.state ? (
    <CustomerJourneyPrompt state={searchTip.state} onPrimary={focusSearchTip} onDismiss={searchTip.dismiss} />
  ) : null;

  const openPersonalisedProduct = useCallback(async (suggestion) => {
    const code = String(suggestion?.code || '').trim().toUpperCase();
    if (!code) return;
    const exact = (product) => product && [product.code, product.sku, product.id]
      .some(value => String(value || '').trim().toUpperCase() === code)
      && shoppingSource(product) === suggestion.source;
    const instore = instoreCatalogue();
    let product = [...catalogProducts, ...instoreSearch.products, ...(Array.isArray(instore) ? instore : [])].find(exact);
    if (!product) {
      try { product = (await fetchProductsBySkus([code])).get(code); } catch { return; }
    }
    if (exact(product)) handleProductPreview(product);
    else setCartAnnouncement('That product is no longer available in the catalogue.');
  }, [catalogProducts, instoreSearch.products, handleProductPreview]);
  const personalisedArrival = usePersonalisedArrivals({
    accountId: customer?.id,
    enabled: import.meta.env.DEV || import.meta.env.VITE_PERSONALISED_ARRIVALS_ENABLED === 'true',
    ready: cartHydrated && orderHistoryResolved && journeyReady,
    browsing: path.length === 0 || viewingInstoreProducts,
    blocked: Boolean(searchTip.state || customerJourney || showPopup || mobileMenuOpen || desktopDrawerVisible || mobileCartOpen || modalOpen || reorderModal || previewProduct) || ['sending', 'sent', 'saved'].includes(orderStatus),
    onOpenProduct: openPersonalisedProduct,
  });

  return (
    <div className="app-root" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{cartAnnouncement}</p>
      <Header
        categories={categories}
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
        previousOrderItems={lastOrder?.items || []}
        onLogout={onLogout}
        onSpecials={() => handleShortcut('specials')}
        onInstoreProducts={() => navigate(['instore-products'])}
        onSearchAddToCart={(product, qty) => addToCart(product, qty)}
        onCartClick={handleCartOpen}
        onMobileSearchRequest={viewingInstoreProducts ? focusInstoreSearch : undefined}
        mobileSearchLabel={viewingInstoreProducts ? 'Search Instore Products' : 'Search'}
        mobileSearchControlsId={viewingInstoreProducts ? 'instore-search' : undefined}
      />

      {searchTipPrompt}
      {personalisedArrival.state && <PersonalisedArrivalTip tip={personalisedArrival} />}
      {customerJourney?.presentation !== 'basket' ? customerJourneyPrompt : null}

      <div className="main-layout" style={{ flex: 1, minHeight: 0 }}>
        <aside className="sidebar-rail">
          <Sidebar
            categories={categories}
            path={path}
            navigate={navigate}
            onAllProducts={goAllProducts}
            onInstoreProducts={() => navigate(['instore-products'])}
            setRefinement={setRefinement}
            counts={counts}
            customer={customer}
          />
        </aside>

        <main className="content-area">
          {viewingInstoreProducts && !instoreAvailable ? <section style={{ padding: 32 }} aria-labelledby="instore-paused-title"><h1 id="instore-paused-title">Instore Products is temporarily unavailable</h1><p>We’re checking this collection before reopening it. You can still shop our main catalogue.</p><button type="button" onClick={goAllProducts}>Shop main catalogue</button></section> : viewingInstoreProducts ? <ExtendedRangePage
            analyticsCustomerId={customer?.id}
            initialQuery={instoreRouteQuery}
            initialPage={instoreRoutePage}
            searchInputRef={instoreSearchInputRef}
            addToCart={(product, qty, position, preference) => addToCart(product, qty, position, preference, 'instore')}
            cartQtyMap={cartQtyMap}
            cartPreferenceMap={cartPreferenceMap}
            specialsMap={specialsMap}
            browseCategory={String(refinements.browse || '')}
            onSearchQueryChange={(nextQuery) => {
              hashNavigate(path, instoreSearchRefinements(refinements, nextQuery), { scroll: false });
            }}
            onPageChange={(nextPage) => {
              hashNavigate(path, instorePageRefinements(refinements, nextPage), { scroll: false });
            }}
          /> : <MainContent
            products={visibleCatalogResults.products}
            resultsTotal={visibleCatalogResults.total}
            addToCart={addToCart}
            cartQtyMap={cartQtyMap}
            onCartQtyChange={handleCartQtyChange}
            specialsMap={specialsMap}
            path={path}
            navigate={navigate}
            breadcrumb={breadcrumb}
            searchQuery={routeSearchQuery}
            onClearSearch={clearCatalogueSearch}
            sort={sort}
            setSort={handleSortChange}
            onShortcut={handleShortcut}
            activeCollection={activeCollection}
            collectionLabel={collectionLabel(activeCollection)}
            recommendationProducts={recommendationProducts}
            loading={catalogueResultsPending}
            catalogueError={catalogError}
            onRetryCatalogue={() => setCatalogRefreshKey((key) => key + 1)}
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
            inStockOnly={inStockOnly}
            searchActive={Boolean(routeSearchQuery.trim())}
            onSearchProductClick={handleSearchProductClick}
            onResetFilters={handleResetFilters}
            refinements={catalogueRefinements}
            journeyPrompt={customerJourney?.presentation === 'basket' ? customerJourneyPrompt : null}
            instoreSearch={visibleInstoreSearch}
            onViewAllInstore={viewAllInstoreMatches}
          />}
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
            quantityCapForProduct={cartQtyCapForProduct}
            removeFromCart={removeFromCart}
            clearCart={clearCart}
            onUndoClear={undoClearCart}
            canUndoClear={Boolean(clearedCartSnapshot)}
            onCheckoutReview={trackCheckoutReview}
            sendOrderEmail={sendOrderEmail}
            customer={customer}
            autoCloseProgress={cartExpiryProgress}
            showAutoCloseBar={cartExpiryRemainingMs !== null}
            cartExpiryRemainingMs={cartExpiryRemainingMs}
            cartExpiryTone={cartExpiryTone}
            cartSyncStatus={cartStorageIssue ? 'error' : cartSyncStatus}
            cartSyncIssue={cartStorageIssue || cartSyncIssue}
            productReviewRequired={cartProductsNeedReview(cartItems)}
            pendingRecoveryCopies={pendingRecoveryCopies}
            onRestorePendingCopy={restorePendingRecoveryCopy}
            onDiscardPendingCopy={discardPendingRecoveryCopy}
            deviceBasketCopy={deviceBasketCopy}
            onDiscardDeviceBasketCopy={discardDeviceBasketCopy}
            cartPreviewMode={cartPreviewMode}
            priceChanges={cartPriceChanges}
            onDismissPriceChanges={() => setCartPriceChanges([])}
            onRetryCartSync={retryCartSync}
            cartReady={cartHydrated}
            onClose={() => closeDesktopCart({ restoreFocus: cartDrawerOpen })}
            onContinueShopping={() => closeDesktopCart({ restoreFocus: true })}
            revealItemRequest={cartRevealRequest}
            initialScrollTop={cartScrollTop}
            onRevealItemHandled={handleCartRevealHandled}
            onScrollPositionChange={handleCartScrollPositionChange}
            onEditDeliveryAddress={onViewProfile}
            orderStatus={orderStatus}
          />}
        </aside>
      </div>

      <Suspense fallback={null}>
        <OrderConfirmModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          orderStatus={orderStatus}
          orderError={orderError}
          orderChanges={orderChanges}
          orderNumber={submittedOrderNumber}
          orderRecoveryNote={orderRecoveryNote}
          pendingRequestSummary={pendingRequestSummary}
          currentBasketSummary={{ lineCount: cartItems.length, total: cartTotal, fingerprint: cartFingerprint(cartItems) }}
          cleanupWarning={(['sent', 'saved'].includes(orderStatus) && (Boolean(cartStorageIssue) || cartSyncStatus === 'error'))
            || (orderStatus === 'received' && recoveryReceiptDurable && cartItems.length === 0)}
          onRetryCleanup={retryCartSync}
          onReviewCurrentBasket={recoveryReceiptDurable
            && (orderStatus !== 'received' || cartFingerprint(cartItems) !== pendingRequestSummary?.fingerprint)
            ? reviewCurrentBasket : undefined}
          onCheckSavedRequest={pendingRequestSummary ? checkSavedRequest : undefined}
          onReview={() => {
            setModalOpen(false);
            setOrderChanges([]);
            setCartAnnouncement('Your basket was refreshed with the latest price and stock. Review any highlighted changes before submitting again.');
            if (window.matchMedia?.('(max-width: 768px)').matches) setMobileCartOpen(true);
            else setCartDrawerOpen(true);
          }}
          onViewOrder={viewSubmittedOrder}
        />
      </Suspense>

      {reorderModal && <Suspense fallback={null}><ReorderModal key={lastOrder?.id || 'last-order'} lastOrder={lastOrder} onReorder={handleReorder} onClose={() => setReorderModal(false)} /></Suspense>}

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
            initialFocusOptions={previewOptionsFirst}
            onZoomClose={closeProductPreview}
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
        onInstoreProducts={() => { navigate(['instore-products']); setMobileMenuOpen(false); }}
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
                quantityCapForProduct={cartQtyCapForProduct}
                removeFromCart={removeFromCart}
                clearCart={clearCart}
                onUndoClear={undoClearCart}
                canUndoClear={Boolean(clearedCartSnapshot)}
                onCheckoutReview={trackCheckoutReview}
                sendOrderEmail={sendOrderEmail}
                customer={customer}
                autoCloseProgress={cartExpiryProgress}
                showAutoCloseBar={cartExpiryRemainingMs !== null}
                cartExpiryRemainingMs={cartExpiryRemainingMs}
                cartExpiryTone={cartExpiryTone}
                cartSyncStatus={cartStorageIssue ? 'error' : cartSyncStatus}
            cartSyncIssue={cartStorageIssue || cartSyncIssue}
                productReviewRequired={cartProductsNeedReview(cartItems)}
                pendingRecoveryCopies={pendingRecoveryCopies}
                onRestorePendingCopy={restorePendingRecoveryCopy}
                onDiscardPendingCopy={discardPendingRecoveryCopy}
                deviceBasketCopy={deviceBasketCopy}
                onDiscardDeviceBasketCopy={discardDeviceBasketCopy}
                cartPreviewMode={cartPreviewMode}
                priceChanges={cartPriceChanges}
                onDismissPriceChanges={() => setCartPriceChanges([])}
                onRetryCartSync={retryCartSync}
                cartReady={cartHydrated}
                onContinueShopping={() => setMobileCartOpen(false)}
                revealItemRequest={cartRevealRequest}
                initialScrollTop={cartScrollTop}
                onRevealItemHandled={handleCartRevealHandled}
                onScrollPositionChange={handleCartScrollPositionChange}
                onEditDeliveryAddress={onViewProfile}
                orderStatus={orderStatus}
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

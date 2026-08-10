import { useRef, useState, useEffect, useCallback, useId, useMemo } from 'react';
import {
  Clock3, Home, Info, LayoutDashboard, LayoutGrid, Loader2, LogOut, Menu, PackageSearch, RotateCcw,
  MessageCircle, Plus, ScanBarcode, Search, ShoppingCart, Star, Upload, User, X,
} from 'lucide-react';
import { getRelatedSearchTerm, getSuggestions, prepareSearchIndex } from '../lib/fuzzySearch';
import { fetchIdentifierProducts, fetchProducts } from '../lib/products';
import { isIdentifierQuery, normalizeIdentifier } from '../lib/identifierNormalize';
import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';
import categoriesData from '../data/categories.json';
import ProtoLogo from './ProtoLogo';
import AboutModal from './AboutModal';
import { openIntercom } from '../lib/intercom';
import { authHeaders } from '../lib/authHeaders';
import { shouldPrefetchData } from '../lib/imageUrl';
import './Header.css';

// ─── Recent searches (localStorage) ─────────────────────────
const RS_KEY = 'proto_recent_searches';
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RS_KEY) || '[]'); } catch { return []; }
}
function saveRecent(term) {
  const prev = loadRecent().filter((t) => t.toLowerCase() !== term.toLowerCase());
  const next = [term, ...prev].slice(0, 6);
  try { localStorage.setItem(RS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
}
function clearRecent() {
  try { localStorage.removeItem(RS_KEY); } catch { /* storage unavailable */ }
}

// ─── Flatten categories tree for search matching ─────────────
const FLAT_CATS = (() => {
  const out = [];
  function walk(nodes, path) {
    for (const n of nodes) {
      out.push({ id: n.id, label: n.label, icon: n.icon, path: [...path, n.id] });
      if (n.children) walk(n.children, [...path, n.id]);
    }
  }
  walk(categoriesData, []);
  return out;
})();

const SEARCH_STARTER_DEPTS = FLAT_CATS.filter((cat) => cat.path.length === 1).slice(0, 6);

function scoreCategoryMatch(label, query) {
  const l = label.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!l.includes(q) && !q.split(' ').some((w) => w.length > 2 && l.includes(w))) return 0;

  let score = 10;
  if (/\bbags?\b/.test(l)) score += 40;
  if (/\s+bags?\s*$/.test(l)) score += 25;
  if (l.startsWith(q)) score += 15;
  if (/\b(components|straps|accessories|clasps|tools)\b/.test(l)) score -= 30;
  if (/\bcases\b/.test(l)) score -= 15;
  if (/\bpackets?\s+and\s+bags\b/.test(l)) score -= 10;
  if (l.split(/\s+/).length <= 3) score += 5;
  return score;
}

function matchCategories(query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const seen = new Set();
  return FLAT_CATS
    .map((c) => ({ cat: c, score: scoreCategoryMatch(c.label, q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.cat.label.localeCompare(b.cat.label))
    .filter(({ cat }) => {
      if (seen.has(cat.label)) return false;
      seen.add(cat.label);
      return true;
    })
    .slice(0, 6)
    .map(({ cat }) => cat);
}

function ProductRequestModal({ onClose }) {
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('');
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    const onGlobalEscape = (event) => {
      if (event.key !== 'Escape') return;
      onClose?.();
    };
    document.addEventListener('keydown', onGlobalEscape);
    return () => document.removeEventListener('keydown', onGlobalEscape);
  }, [onClose]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setImage({ base64: dataUrl.split(',')[1], name: file.name, type: file.type, preview: dataUrl });
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); };

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Please describe the product you are looking for.'); return; }
    if (!image) { setError('Please attach a reference image.'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/product-request', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ description: description.trim(), qty: qty.trim() || null, imageBase64: image.base64, imageName: image.name, imageType: image.type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send request.');
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="topnav-modal-backdrop" onClick={onClose}>
      <div className="topnav-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <button className="topnav-modal-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <PackageSearch size={40} style={{ color: '#8B1A1A', margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ marginBottom: 8 }}>Request sent!</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Our team will get back to you shortly.</p>
            <button onClick={onClose} style={{ marginTop: 20, padding: '10px 24px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
              <PackageSearch size={20} style={{ color: '#8B1A1A', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Can't find what you're looking for?</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Describe the product and attach a reference image — we'll source it for you.</p>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Product description <span style={{ color: '#e11d48' }}>*</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you're looking for — size, colour, material, use case…" rows={3} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, color: '#0f172a', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Quantity <span style={{ color: '#9ca3af', fontWeight: 500, textTransform: 'none', fontSize: 11 }}>(optional)</span></label>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 100" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Reference image <span style={{ color: '#e11d48' }}>*</span></label>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              <div onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
                style={{ border: `2px dashed ${image ? '#d1d5db' : '#cbd5e1'}`, borderRadius: 10, background: image ? '#f8f8f8' : '#f8fafc', minHeight: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', gap: 6, padding: image ? 0 : 16 }}>
                {image ? (
                  <><img src={image.preview} alt="Reference" style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain', padding: 8 }} /><div style={{ fontSize: 12, color: '#6b7280', paddingBottom: 8 }}>Click or drop to change</div></>
                ) : (
                  <><Upload size={22} style={{ color: '#9ca3af' }} /><div style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>Drop image here or click to browse</div></>
                )}
              </div>
            </div>
            {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#7f1d1d', fontSize: 13 }}>{error}</div>}
            <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: 13, background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? <><Loader2 size={16} className="spin-icon" /> Sending…</> : <><PackageSearch size={16} /> Send Request</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function productStockState(product) {
  const raw = product?.stockOnHand ?? product?.stockQty ?? product?.available_stock ?? product?.stock_qty;
  const qty = raw === undefined || raw === null || raw === '' ? null : Number(raw);
  const toOrder = product?.toOrder === true
    || product?.to_order === true
    || product?.orderableWhenOutOfStock === true
    || product?.orderable_when_out_of_stock === true;
  if (qty === 0 && toOrder) return { tone: 'order', label: 'To order', canOrder: true };
  if (qty === 0 || product?.inStock === false) return { tone: 'out', label: 'Out of stock', canOrder: false };
  if (Number.isFinite(qty) && qty > 0 && qty <= 5) return { tone: 'low', label: 'Low stock', canOrder: true };
  return { tone: 'in', label: 'In stock', canOrder: true };
}

function HighlightedText({ text, query }) {
  const source = String(text || '');
  const terms = String(query || '').trim().split(/\s+/).filter((term) => term.length > 1);
  if (!source || terms.length === 0) return source;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matcher = new RegExp(`(${escaped.join('|')})`, 'ig');
  const exactMatcher = new RegExp(`^(${escaped.join('|')})$`, 'i');
  return source.split(matcher).map((part, index) => (
    exactMatcher.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part
  ));
}

function SearchProductResult({
  product,
  query,
  optionId,
  active,
  exact = false,
  dark = false,
  previouslyOrdered = false,
  onPick,
  onAdd,
}) {
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef(null);
  const stock = productStockState(product);
  const packLabel = product.casePack || (Number(product.minQty) > 1 ? `Min ${product.minQty}` : '');
  const sku = product.websiteSku || product.sku || product.id || '';
  const barcode = product.barcode || product.code || '';

  const addProduct = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!stock.canOrder || !onAdd) return;
    onAdd(product, Math.max(1, Number(product.minQty) || 1));
    setAdded(true);
    window.clearTimeout(addedTimerRef.current);
    addedTimerRef.current = window.setTimeout(() => setAdded(false), 1400);
  };

  useEffect(() => () => window.clearTimeout(addedTimerRef.current), []);

  return (
    <div
      className={`sp-product-row${exact ? ' sp-product-row--exact' : ''}${dark ? ' sp-product-row--dark' : ''}${active ? ' active' : ''}`}
    >
      <button
        id={optionId}
        type="button"
        className="sp-product-main"
        role="option"
        aria-selected={active}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick(product)}
      >
        <div className="sp-product-img">
          {product.image
            ? <img src={product.image} alt="" loading="lazy" />
            : <div className="sp-product-img-empty" />}
        </div>
        <div className="sp-product-info">
          <span className="sp-product-identifiers">
            {sku && (
              <span className="sp-product-code">
                SKU <HighlightedText text={sku} query={query} />
              </span>
            )}
            {barcode && String(barcode).toUpperCase() !== String(sku).toUpperCase() && (
              <span className="sp-product-barcode">
                Barcode <HighlightedText text={barcode} query={query} />
              </span>
            )}
          </span>
          <span className="sp-product-name">
            <HighlightedText text={product.name} query={query} />
          </span>
          <span className="sp-product-meta">
            <span className={`sp-stock-badge sp-stock-badge--${stock.tone}`}>{stock.label}</span>
            {packLabel && <span>{packLabel}</span>}
            {product.isNew && <span className="sp-new-badge">New</span>}
            {previouslyOrdered && <span className="sp-reorder-badge">Previously ordered</span>}
          </span>
        </div>
        {Number(product.price) > 0 && (
          <span className="sp-product-price">
            R{Number(product.price).toFixed(2)}
            <small>incl. VAT</small>
          </span>
        )}
      </button>
      {onAdd && (
        <button
          type="button"
          className={`sp-quick-add${added ? ' is-added' : ''}`}
          disabled={!stock.canOrder}
          onMouseDown={(event) => event.preventDefault()}
          onClick={addProduct}
          aria-label={stock.canOrder ? `Add ${product.name} to order` : `${product.name} is out of stock`}
        >
          {added ? 'Added ✓' : <><Plus size={14} /> Add</>}
        </button>
      )}
    </div>
  );
}

// ─── Search overlay panel ─────────────────────────────────────
function SearchPanel({
  query,
  suggestions,
  catMatches,
  activeItemId,
  listboxId,
  onPickProduct,
  onPickCategory,
  onCommitSearch,
  recentSearches,
  onClearRecent,
  onAddProduct,
  onRequestProduct,
  previousOrderCodes,
  searchState = 'idle',
  onRetry,
}) {
  if (!query.trim()) {
    return (
      <div className="search-panel search-panel--empty" id={listboxId} role="listbox" aria-label="Search suggestions">
        <div className="sp-search-intro">
          <span className="sp-search-intro-icon"><Search size={18} /></span>
          <div>
            <strong>Find anything in seconds</strong>
            <span>Search by product name, SKU or barcode.</span>
          </div>
        </div>

        {recentSearches.length > 0 && (
          <div className="sp-start-section">
            <div className="sp-start-heading">
              <span><Clock3 size={13} /> Recent searches</span>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClearRecent}>Clear</button>
            </div>
            <div className="sp-start-chips">
              {recentSearches.map((term) => (
                <button
                  key={term}
                  type="button"
                  className="sp-start-chip"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onCommitSearch(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sp-start-section">
          <div className="sp-start-heading"><span>Browse a department</span></div>
          <div className="sp-start-depts">
            {SEARCH_STARTER_DEPTS.map((cat) => {
              const color = DEPT_COLORS[cat.path[0]] || '#C89A3C';
              const Icon = cat.icon ? LUCIDE_ICON_MAP[cat.icon] : LayoutGrid;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="sp-start-dept"
                  style={{ '--dept-accent': color }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickCategory(cat.path)}
                >
                  <Icon size={15} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sp-search-help">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> select</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    );
  }

  const codeSearch = isIdentifierQuery(query);
  const queryIdentifier = normalizeIdentifier(query);
  const exactProduct = codeSearch ? suggestions.find((product) => [
    product.code, product.barcode, product.sku, product.websiteSku, product.parentSku,
  ].some((value) => normalizeIdentifier(value) === queryIdentifier)) : null;
  const relatedProducts = exactProduct
    ? suggestions.filter((product) => product.id !== exactProduct.id)
    : suggestions;
  const relatedSearchTerm = getRelatedSearchTerm(query);

  return (
    <div className="search-panel" id={listboxId} role="listbox" aria-label="Search suggestions">
      {searchState === 'loading' && (
        <div className="sp-search-status sp-search-status--loading" role="status" aria-live="polite">
          <Loader2 size={16} className="spin-icon" aria-hidden="true" />
          <span>Searching products…</span>
        </div>
      )}
      {searchState === 'error' && (
        <div className="sp-search-status sp-search-status--error" role="alert">
          <div>
            <strong>Search couldn’t connect</strong>
            <span>Your wording is fine. Please try again.</span>
          </div>
          <button type="button" onClick={onRetry}>
            <RotateCcw size={14} aria-hidden="true" /> Try again
          </button>
        </div>
      )}
      {relatedSearchTerm && suggestions.length > 0 && (
        <div className="sp-related-search">
          We also searched for <strong>{relatedSearchTerm}</strong>
        </div>
      )}
      {/* Category matches */}
      {catMatches.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-head"><span>Categories</span></div>
          {catMatches.map((cat) => {
            const color = DEPT_COLORS[cat.path[0]] || '#374151';
            const Icon = cat.icon ? LUCIDE_ICON_MAP[cat.icon] : null;
            const optionId = `${listboxId}-cat-${cat.id}`;
            const isActive = activeItemId === optionId;
            return (
              <button
                key={cat.id}
                id={optionId}
                type="button"
                className={`sp-cat-row${isActive ? ' active' : ''}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickCategory(cat.path)}
              >
                {Icon && <span className="sp-cat-icon" style={{ background: `${color}18`, color }}><Icon size={13} /></span>}
                <span className="sp-cat-label">{cat.label}</span>
                <span className="sp-cat-arrow">Browse →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Exact identifier result — put it above broad product matches. */}
      {exactProduct && (
        <div className="sp-section sp-section--exact">
          <div className="sp-section-head"><span>Exact code match</span><span className="sp-exact-badge">Ready to order</span></div>
          <SearchProductResult
            key={exactProduct.id}
            product={exactProduct}
            query={query}
            optionId={`${listboxId}-product-${exactProduct.id}`}
            active={activeItemId === `${listboxId}-product-${exactProduct.id}`}
            exact
            previouslyOrdered={previousOrderCodes.has(String(exactProduct.code || exactProduct.sku || '').toUpperCase())}
            onPick={onPickProduct}
            onAdd={onAddProduct}
          />
        </div>
      )}

      {/* Product results */}
      {relatedProducts.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-head">
            <span>{codeSearch ? 'Closest code matches' : 'Products'}</span>
            <button
              type="button"
              className="sp-view-all-link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onCommitSearch(query)}
            >
              View all results →
            </button>
          </div>
          {relatedProducts.map((p) => {
            const optionId = `${listboxId}-product-${p.id}`;
            const isActive = activeItemId === optionId;
            return (
              <SearchProductResult
                key={p.id}
                product={p}
                query={query}
                optionId={optionId}
                active={isActive}
                previouslyOrdered={previousOrderCodes.has(String(p.code || p.sku || '').toUpperCase())}
                onPick={onPickProduct}
                onAdd={onAddProduct}
              />
            );
          })}
        </div>
      )}

      {searchState !== 'loading' && searchState !== 'error' && suggestions.length === 0 && catMatches.length === 0 && (
        <div className="sp-empty">
          <Search size={24} />
          <p>No results for "<strong>{query}</strong>"</p>
          <span>{codeSearch ? 'Check the code, or remove the last digit to see the closest product codes.' : 'Try a different spelling, product type or department.'}</span>
          <button type="button" className="sp-request-product" onClick={onRequestProduct}>
            <PackageSearch size={15} /> Request this product
          </button>
        </div>
      )}
    </div>
  );
}

function moveActiveSuggestionIndex(currentIndex, totalItems, direction) {
  if (totalItems <= 0) return -1;
  if (currentIndex < 0) return direction > 0 ? 0 : totalItems - 1;
  const next = currentIndex + direction;
  if (next < 0) return totalItems - 1;
  if (next >= totalItems) return 0;
  return next;
}

// ─── Cart progress fill icon ──────────────────────────────────
const MIN_ORDER = 1000;

function CartProgressIcon({ cartTotal, size = 22 }) {
  const pct = Math.min(100, Math.max(0, (cartTotal / MIN_ORDER) * 100));
  const clipY = ((1 - pct / 100) * size).toFixed(1);
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <ShoppingCart size={size} style={{ color: pct === 0 ? 'currentColor' : 'rgba(255,255,255,0.55)' }} />
      {pct > 0 && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', clipPath: `inset(${clipY}px 0 0 0)` }}>
          <ShoppingCart size={size} style={{ color: '#8B1A1A' }} />
        </div>
      )}
    </div>
  );
}

export { AboutModal };

// ─── Header ──────────────────────────────────────────────────
export default function Header({
  cartItemCount, cartTotal,
  onMenuClick, onHome, customer, onViewProfile, onReorder, hasLastOrder, onLogout,
  searchQuery, setSearchQuery, navigateForSearch, onSpecials, onCartClick, onSearchAddToCart,
  previousOrderItems = [],
  mobileSearchOpen: mobileSearchOpenProp, onMobileSearchOpenChange,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpenInternal, setMobileSearchOpenInternal] = useState(false);
  const mobileSearchOpen = mobileSearchOpenProp ?? mobileSearchOpenInternal;
  const setMobileSearchOpen = onMobileSearchOpenChange ?? setMobileSearchOpenInternal;
  const [showAbout, setShowAbout] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [catMatches, setCatMatches] = useState([]);
  const [desktopSearchState, setDesktopSearchState] = useState('idle');
  const [mobileSearchState, setMobileSearchState] = useState('idle');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [mobileActiveIdx, setMobileActiveIdx] = useState(-1);
  const [recentSearches, setRecentSearches] = useState(loadRecent);
  const productsCache = useRef(null);
  const productsLoading = useRef(null);
  const inputRef = useRef(null);
  const searchWrapRef = useRef(null);
  const barcodeFileRef = useRef(null);
  const debounceRef = useRef(null);
  const suggestionRequestRef = useRef(0);
  const liftRef = useRef(null);
  // Local mirror of the search box text. The parent's `searchQuery` (which
  // drives the catalogue query and re-renders the whole product grid) is only
  // updated on a short debounce, so each keystroke re-renders just this input.
  const [inputValue, setInputValue] = useState(searchQuery);
  const [barcodeSupported] = useState(() => typeof window !== 'undefined' && 'BarcodeDetector' in window);
  const [scanError, setScanError] = useState('');
  const pendingSearchRef = useRef(searchQuery);
  const desktopListboxId = useId();
  const mobileListboxId = useId();
  const previousOrderCodes = useMemo(() => new Set(
    previousOrderItems
      .map((item) => item.code || item.sku)
      .filter(Boolean)
      .map((code) => String(code).toUpperCase()),
  ), [previousOrderItems]);

  const loadProductsOnce = useCallback(async () => {
    if (productsCache.current) return productsCache.current;
    if (productsLoading.current) return productsLoading.current;
    productsLoading.current = (async () => {
      try {
        productsCache.current = await fetchProducts();
        const products = productsCache.current;
        const warmIndex = () => prepareSearchIndex(products);
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(warmIndex, { timeout: 1500 });
        } else {
          window.setTimeout(warmIndex, 0);
        }
        return productsCache.current;
      } finally {
        productsLoading.current = null;
      }
    })();
    return productsLoading.current;
  }, []);

  const updateSuggestions = useCallback((query, products) => {
    if (!query.trim()) { setSuggestions([]); setCatMatches([]); return; }
    const matches = getSuggestions(products, query, 20);
    setSuggestions([...matches].sort((a, b) => (
      Number(previousOrderCodes.has(String(b.code || b.sku || '').toUpperCase()))
      - Number(previousOrderCodes.has(String(a.code || a.sku || '').toUpperCase()))
    )));
    setCatMatches(matchCategories(query));
  }, [previousOrderCodes]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSuggestions([]);
    setCatMatches([]);
    setDesktopSearchState('idle');
    setActiveIdx(-1);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);
  useEffect(() => () => clearTimeout(liftRef.current), []);

  // Reflect external changes to searchQuery (navigation resets, welcome
  // dismiss, "clear filters") into the local input, and cancel any stale
  // pending lift so it can't resurrect an old term.
  useEffect(() => {
    if (searchQuery !== pendingSearchRef.current) {
      clearTimeout(liftRef.current);
      pendingSearchRef.current = searchQuery;
      setInputValue(searchQuery);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const onPointerDown = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [searchOpen, closeSearch]);

  const scheduleSuggestions = useCallback((query) => {
    clearTimeout(debounceRef.current);
    const requestId = ++suggestionRequestRef.current;
    if (!query.trim()) {
      setSuggestions([]);
      setCatMatches([]);
      setDesktopSearchState('idle');
      return;
    }
    setDesktopSearchState('loading');
    const identifier = isIdentifierQuery(query);
    debounceRef.current = setTimeout(() => {
      if (identifier) {
        void fetchIdentifierProducts(query).then((matches) => {
          if (requestId !== suggestionRequestRef.current) return;
          if (matches.length) {
            setSuggestions(matches.slice(0, 10));
            setCatMatches([]);
            setDesktopSearchState('ready');
            return;
          }
          // If the code is not found, retain the existing local matcher as a
          // fallback for historical/variant identifiers.
          void loadProductsOnce().then((products) => {
            if (requestId === suggestionRequestRef.current) {
              updateSuggestions(query, products);
              setDesktopSearchState('ready');
            }
          }).catch(() => {
            if (requestId === suggestionRequestRef.current) setDesktopSearchState('error');
          });
        }).catch(() => {
          if (requestId !== suggestionRequestRef.current) return;
          void loadProductsOnce().then((products) => {
            if (requestId === suggestionRequestRef.current) {
              updateSuggestions(query, products);
              setDesktopSearchState('ready');
            }
          }).catch(() => {
            if (requestId === suggestionRequestRef.current) setDesktopSearchState('error');
          });
        });
        return;
      }
      void loadProductsOnce().then((products) => {
        if (requestId === suggestionRequestRef.current) {
          updateSuggestions(query, products);
          setDesktopSearchState('ready');
        }
      }).catch(() => {
        if (requestId === suggestionRequestRef.current) setDesktopSearchState('error');
      });
    }, identifier ? 45 : 85);
  }, [loadProductsOnce, updateSuggestions]);

  const openSearch = useCallback(() => {
    setRecentSearches(loadRecent());
    setSearchOpen(true);
    void loadProductsOnce().catch(() => {});
  }, [loadProductsOnce]);

  const focusSearch = useCallback(() => {
    openSearch();
  }, [openSearch]);

  useEffect(() => {
    if (!shouldPrefetchData()) return undefined;
    const prefetch = () => { void loadProductsOnce().catch(() => {}); };
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 2200 });
      return () => window.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(prefetch, 900);
    return () => window.clearTimeout(timer);
  }, [loadProductsOnce]);

  useEffect(() => {
    const focusWithShortcut = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable;
      if (event.key !== '/' || isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      inputRef.current?.focus();
      openSearch();
    };
    document.addEventListener('keydown', focusWithShortcut);
    return () => document.removeEventListener('keydown', focusWithShortcut);
  }, [openSearch]);

  // Debounced lift to the parent so typing doesn't re-render App + every
  // ProductCard (and re-fire the catalogue fetch) on each keystroke.
  const liftSearch = useCallback((val) => {
    pendingSearchRef.current = val;
    clearTimeout(liftRef.current);
    liftRef.current = setTimeout(() => setSearchQuery(val), 350);
  }, [setSearchQuery]);

  // Immediate commit (Enter, suggestion/category pick, clear): cancel any
  // pending debounce and sync the local box + parent together.
  const setSearchImmediate = useCallback((val) => {
    clearTimeout(liftRef.current);
    pendingSearchRef.current = val;
    setInputValue(val);
    setSearchQuery(val);
  }, [setSearchQuery]);

  const handleInput = (val) => {
    setInputValue(val);
    setActiveIdx(-1);
    scheduleSuggestions(val);
    liftSearch(val);
  };

  const keyboardItems = [
    ...catMatches.map((cat) => ({ type: 'cat', id: `cat-${cat.id}`, cat })),
    ...suggestions.map((product) => ({ type: 'product', id: `product-${product.id}`, product })),
  ];
  const activeDesktopItem = activeIdx >= 0 ? keyboardItems[activeIdx] : null;
  const activeDesktopItemId = activeDesktopItem ? `${desktopListboxId}-${activeDesktopItem.id}` : undefined;

  const handleKeyDown = (e) => {
    const items = keyboardItems;
    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!searchOpen) openSearch();
      const direction = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIdx((idx) => moveActiveSuggestionIndex(idx, items.length, direction));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && items[activeIdx]) {
        const activeItem = items[activeIdx];
        if (activeItem.type === 'cat') pickCategory(activeItem.cat.path);
        else pickProduct(activeItem.product);
      } else if (inputValue.trim()) {
        commitSearch(inputValue.trim());
      }
    }
  };

  useEffect(() => {
    setActiveIdx((prevIdx) => Math.min(prevIdx, keyboardItems.length - 1));
  }, [keyboardItems.length]);

  useEffect(() => {
    if (!searchOpen || !activeDesktopItemId) return;
    const activeEl = document.getElementById(activeDesktopItemId);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [searchOpen, activeDesktopItemId]);

  const pickProduct = (p) => {
    const directCode = isIdentifierQuery(inputValue)
      ? (p.websiteSku || p.sku || p.code || inputValue)
      : p.name;
    saveRecent(directCode);
    setRecentSearches(loadRecent());
    setSearchImmediate(directCode);
    navigateForSearch?.([]);
    setSuggestions([]);
    setCatMatches([]);
    setActiveIdx(-1);
    setSearchOpen(false);
  };

  const pickCategory = (catPath) => {
    navigateForSearch?.(catPath);
    setSearchImmediate('');
    closeSearch();
  };

  const commitSearch = (term) => {
    if (!term) return;
    saveRecent(term);
    setRecentSearches(loadRecent());
    setSearchImmediate(term);
    navigateForSearch?.([]);
    setSuggestions([]);
    setCatMatches([]);
    setActiveIdx(-1);
    setSearchOpen(false);
  };

  const submitDesktopSearch = () => {
    const term = inputValue.trim();
    if (term) {
      commitSearch(term);
      return;
    }
    inputRef.current?.focus();
    openSearch();
  };

  // Mobile search — mobileInput is the transient typed text, separate from the
  // committed searchQuery so the input clears after a search without losing results.
  const [mobileSuggestions, setMobileSuggestions] = useState([]);
  const [mobileCatMatches, setMobileCatMatches] = useState([]);
  const [mobileInput, setMobileInput] = useState('');
  const mobileSearchInputRef = useRef(null);
  const openMobileSearch = () => {
    setMobileSearchOpen(true);
    setMobileInput('');
    // The input is permanently mounted, so autoFocus never re-fires; focus it
    // explicitly once the overlay is visible so the keyboard opens right away.
    setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
    setScanError('');
    setMobileActiveIdx(-1);
    setMobileSearchState('idle');
    void loadProductsOnce().catch(() => {});
  };
  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false);
    setMobileSuggestions([]);
    setMobileCatMatches([]);
    setMobileInput('');
    setScanError('');
    setMobileSearchState('idle');
    setMobileActiveIdx(-1);
  }, [setMobileSearchOpen]);
  const handleMobileInput = (val) => {
    setMobileInput(val);
    liftSearch(val);
    setMobileActiveIdx(-1);
    clearTimeout(debounceRef.current);
    const requestId = ++suggestionRequestRef.current;
    if (!val.trim()) {
      setMobileSuggestions([]);
      setMobileCatMatches([]);
      setMobileSearchState('idle');
      return;
    }
    setMobileSearchState('loading');
    const identifier = isIdentifierQuery(val);
    debounceRef.current = setTimeout(() => {
      if (identifier) {
        void fetchIdentifierProducts(val).then((matches) => {
          if (requestId !== suggestionRequestRef.current) return;
          if (matches.length) {
            setMobileSuggestions(matches.slice(0, 10));
            setMobileCatMatches([]);
            setMobileSearchState('ready');
            return;
          }
          void loadProductsOnce().then((products) => {
            if (requestId === suggestionRequestRef.current) {
              setMobileSuggestions(getSuggestions(products, val, 12));
              setMobileCatMatches(matchCategories(val));
              setMobileSearchState('ready');
            }
          }).catch(() => {
            if (requestId === suggestionRequestRef.current) setMobileSearchState('error');
          });
        }).catch(() => {
          if (requestId !== suggestionRequestRef.current) return;
          void loadProductsOnce().then((products) => {
            if (requestId === suggestionRequestRef.current) {
              setMobileSuggestions(getSuggestions(products, val, 12));
              setMobileCatMatches(matchCategories(val));
              setMobileSearchState('ready');
            }
          }).catch(() => {
            if (requestId === suggestionRequestRef.current) setMobileSearchState('error');
          });
        });
        return;
      }
      void loadProductsOnce().then((products) => {
        if (requestId === suggestionRequestRef.current) {
          setMobileSuggestions(getSuggestions(products, val, 12));
          setMobileCatMatches(matchCategories(val));
          setMobileSearchState('ready');
        }
      }).catch(() => {
        if (requestId === suggestionRequestRef.current) setMobileSearchState('error');
      });
    }, identifier ? 45 : 85);
  };
  const mobileKeyboardItems = [
    ...mobileCatMatches.map((cat) => ({ type: 'cat', id: `cat-${cat.id}`, cat })),
    ...mobileSuggestions.map((product) => ({ type: 'product', id: `product-${product.id}`, product })),
  ];
  const activeMobileItem = mobileActiveIdx >= 0 ? mobileKeyboardItems[mobileActiveIdx] : null;
  const activeMobileItemId = activeMobileItem ? `${mobileListboxId}-${activeMobileItem.id}` : undefined;
  const commitMobileSearch = (term) => {
    commitSearch(term);
    setMobileInput('');
    closeMobileSearch();
  };

  const scanBarcodeImage = async (file) => {
    if (!file || !barcodeSupported) return;
    setScanError('');
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new window.BarcodeDetector();
      const matches = await detector.detect(bitmap);
      bitmap.close?.();
      const value = matches[0]?.rawValue?.trim();
      if (!value) {
        setScanError('Barcode not detected. Try again with the code filling the frame.');
        return;
      }
      handleMobileInput(value);
    } catch {
      setScanError('Could not read that barcode image. Please type the code instead.');
    }
  };

  useEffect(() => {
    setMobileActiveIdx((prevIdx) => Math.min(prevIdx, mobileKeyboardItems.length - 1));
  }, [mobileKeyboardItems.length]);

  useEffect(() => {
    if (!mobileSearchOpen || !activeMobileItemId) return;
    const activeEl = document.getElementById(activeMobileItemId);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [mobileSearchOpen, activeMobileItemId]);

  useEffect(() => {
    if (!searchOpen && !mobileSearchOpen) return undefined;
    const onGlobalEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (mobileSearchOpen) {
        event.preventDefault();
        closeMobileSearch();
        return;
      }
      if (searchOpen) {
        event.preventDefault();
        closeSearch();
      }
    };
    document.addEventListener('keydown', onGlobalEscape);
    return () => document.removeEventListener('keydown', onGlobalEscape);
  }, [searchOpen, mobileSearchOpen, closeSearch, closeMobileSearch]);

  const orderTargetMet = cartTotal >= MIN_ORDER;

  return (
    <>
      <header className="app-header app-header--premium">
        {/* Brand */}
        <div className="brand-block">
          <button
            data-cart-trigger="desktop"
            type="button"
            className="header-home-btn desktop-only"
            onClick={onHome}
            aria-label="Home"
            title="Home"
          >
            <Home size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="brand-logo-hit"
            onClick={onHome}
            aria-label="Home"
          >
            <ProtoLogo variant="full" size={44} tagline={false} className="proto-logo-wordmark--enter" />
          </button>
        </div>

        {/* Signature search */}
        <div className="header-search-premium-wrap desktop-only" ref={searchWrapRef}>
          <div className="header-search-premium">
            <input
              ref={inputRef}
              type="text"
              className="header-search-premium__input"
              placeholder="Product name, SKU or barcode…"
              value={inputValue}
              onFocus={focusSearch}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search by product name, SKU or barcode"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-haspopup="listbox"
              aria-controls={desktopListboxId}
              aria-activedescendant={activeDesktopItemId}
            />
            {inputValue ? (
              <button
                type="button"
                className="header-search-premium__clear"
                aria-label="Clear search"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSearchImmediate('');
                  setSuggestions([]);
                  setCatMatches([]);
                  setDesktopSearchState('idle');
                  setActiveIdx(-1);
                  inputRef.current?.focus();
                }}
              >
                <X size={15} />
              </button>
            ) : null}
            <button
              type="button"
              className="header-search-premium__submit"
              onMouseDown={(event) => event.preventDefault()}
              onClick={submitDesktopSearch}
              title="Search products (keyboard shortcut: /)"
            >
              <Search size={15} aria-hidden="true" />
              <span>Search</span>
            </button>
          </div>
          {searchOpen && (
            <div className="header-search-dropdown">
              <SearchPanel
                query={inputValue}
                suggestions={suggestions}
                catMatches={catMatches}
                activeItemId={activeDesktopItemId}
                listboxId={desktopListboxId}
                onPickProduct={pickProduct}
                onPickCategory={pickCategory}
                onCommitSearch={commitSearch}
                recentSearches={recentSearches}
                onClearRecent={() => {
                  clearRecent();
                  setRecentSearches([]);
                }}
                onAddProduct={onSearchAddToCart}
                onRequestProduct={() => {
                  closeSearch();
                  setShowRequest(true);
                }}
                previousOrderCodes={previousOrderCodes}
                searchState={desktopSearchState}
                onRetry={() => scheduleSuggestions(inputValue)}
              />
            </div>
          )}
        </div>

        <div className="header-utilities">
          <nav className="header-nav desktop-only">
            {hasLastOrder && (
              <button className="header-nav-btn" type="button" onClick={onReorder}>
                <RotateCcw size={14} />
                Reorder
              </button>
            )}

            <button className="header-nav-btn" type="button" onClick={() => setShowAbout(true)}>
              <Info size={14} />
              About Us
            </button>

            <button className="header-nav-btn header-nav-ask-proto" type="button" onClick={openIntercom}>
              <MessageCircle size={14} />
              Ask Proto
            </button>

            <button className="header-nav-btn header-nav-specials" type="button" onClick={onSpecials}>
              <Star size={14} className="spinning-star" />
              Specials
            </button>
          </nav>

          <div className="header-actions">
          {customer?.role === 'admin' && (
            <a className="header-action desktop-only" href="https://protoportal-admin.vercel.app" target="_blank" rel="noreferrer">
              <LayoutDashboard size={19} />
              <span><small>Admin</small>Dashboard</span>
            </a>
          )}

          <button className="header-action desktop-only" type="button" onClick={onViewProfile}>
            <User size={19} />
            <span>My Profile</span>
          </button>

          {onLogout && (
            <button className="header-action desktop-only" type="button" onClick={onLogout} title="Log out" style={{ opacity: 0.75 }}>
              <LogOut size={17} />
            </button>
          )}

          {/* Mobile-only icon buttons */}
          <button
            className="header-icon-mobile header-icon-mobile--ask-proto"
            type="button"
            onClick={openIntercom}
            aria-label="Ask Proto"
            title="Ask Proto"
          >
            <MessageCircle size={17} />
          </button>
          <button className="header-icon-mobile header-icon-mobile--profile" type="button" onClick={onViewProfile} aria-label="My profile">
            <User size={17} />
          </button>
          {onLogout && (
            <button className="header-icon-mobile header-icon-mobile--logout" type="button" onClick={onLogout} aria-label="Log out" style={{ opacity: 0.65 }}>
              <LogOut size={16} />
            </button>
          )}

          <button
            type="button"
            className={`cart-summary${orderTargetMet ? ' cart-summary--ready' : ''}`}
            onClick={onCartClick}
            style={onCartClick ? { cursor: 'pointer' } : undefined}
            aria-label={`Open cart. ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}. Order total R${cartTotal.toFixed(2)}.`}
          >
            <span className="cart-summary-icon">
              <CartProgressIcon cartTotal={cartTotal} size={22} />
            </span>
            <span className="cart-summary-meta">
              <small>Order total</small>
              <strong className="cart-summary-amount">R{cartTotal.toFixed(2)}</strong>
            </span>
          </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — primary navigation */}
      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        <button type="button" className="mobile-tab-bar-btn" onClick={onHome}>
          <Home size={20} />
          <span>Home</span>
        </button>
        <button type="button" className={`mobile-tab-bar-btn${mobileSearchOpen ? ' active' : ''}`} onClick={mobileSearchOpen ? closeMobileSearch : openMobileSearch}>
          <Search size={20} />
          <span>Search</span>
        </button>
        <button type="button" className="mobile-tab-bar-btn" onClick={onMenuClick}>
          <Menu size={20} />
          <span>Categories</span>
        </button>
        <button data-cart-trigger="mobile" type="button" className="mobile-tab-bar-btn mobile-tab-bar-btn--cart" onClick={onCartClick}>
          <ShoppingCart size={20} />
          <span>Cart</span>
          {cartItemCount > 0 && <em className="mobile-tab-bar-badge">{cartItemCount}</em>}
        </button>
      </nav>

      {/* Mobile search */}
      <div className={`mobile-action-search-drop${mobileSearchOpen ? ' open' : ''}`}>
        <button
          type="button"
          className="mobile-search-submit"
          aria-label="Search"
          onClick={() => {
            if (mobileInput.trim()) commitMobileSearch(mobileInput.trim());
            else mobileSearchInputRef.current?.focus();
          }}
        >
          <Search size={17} />
        </button>
        <input
          ref={mobileSearchInputRef}
          type="search"
          placeholder="Product name, SKU or barcode…"
          value={mobileInput}
          onChange={(e) => handleMobileInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeMobileSearch();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMobileActiveIdx((idx) => moveActiveSuggestionIndex(idx, mobileKeyboardItems.length, 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMobileActiveIdx((idx) => moveActiveSuggestionIndex(idx, mobileKeyboardItems.length, -1));
            }
            if (e.key === 'Enter' && mobileInput.trim()) {
              e.preventDefault();
              if (activeMobileItem) {
                if (activeMobileItem.type === 'cat') {
                  pickCategory(activeMobileItem.cat.path);
                } else {
                  pickProduct(activeMobileItem.product);
                }
                setMobileInput('');
                closeMobileSearch();
                return;
              }
              commitMobileSearch(mobileInput.trim());
            }
          }}
          aria-label="Search by product name, SKU or barcode"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mobileSearchOpen && Boolean(mobileInput.trim())}
          aria-haspopup="listbox"
          aria-controls={mobileListboxId}
          aria-activedescendant={activeMobileItemId}
        />
        {mobileInput && (
          <button type="button" onClick={() => { setMobileInput(''); setSearchImmediate(''); setMobileSuggestions([]); setMobileCatMatches([]); setMobileSearchState('idle'); }} aria-label="Clear">
            <X size={15} />
          </button>
        )}
        {barcodeSupported && (
          <>
            <input
              ref={barcodeFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void scanBarcodeImage(file);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="mobile-search-scan"
              onClick={() => barcodeFileRef.current?.click()}
              aria-label="Scan barcode with camera"
            >
              <ScanBarcode size={18} />
            </button>
          </>
        )}
        <button type="button" onClick={closeMobileSearch} aria-label="Close"><X size={15} /></button>
      </div>
      {mobileSearchOpen && scanError && <div className="mobile-search-scan-error">{scanError}</div>}

      {/* Mobile category + product results */}
      {mobileSearchOpen && mobileInput.trim() && (
        <div className="mobile-search-results" id={mobileListboxId} role="listbox" aria-label="Mobile search suggestions">
          {mobileSearchState === 'loading' && (
            <div className="sp-search-status sp-search-status--loading" role="status" aria-live="polite">
              <Loader2 size={16} className="spin-icon" aria-hidden="true" />
              <span>Searching products…</span>
            </div>
          )}
          {mobileSearchState === 'error' && (
            <div className="sp-search-status sp-search-status--error" role="alert">
              <div>
                <strong>Search couldn’t connect</strong>
                <span>Your wording is fine. Please try again.</span>
              </div>
              <button type="button" onClick={() => handleMobileInput(mobileInput)}>
                <RotateCcw size={14} aria-hidden="true" /> Try again
              </button>
            </div>
          )}
          {mobileCatMatches.map((cat) => {
            const optionId = `${mobileListboxId}-cat-${cat.id}`;
            const isActive = activeMobileItemId === optionId;
            return (
              <button
                key={cat.id}
                id={optionId}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`sp-cat-row sp-cat-row--dark${isActive ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { pickCategory(cat.path); setMobileInput(''); closeMobileSearch(); }}
              >
                <span className="sp-cat-label">{cat.label}</span>
                <span className="sp-cat-arrow">→</span>
              </button>
            );
          })}
          {mobileSuggestions.map((p) => {
            const optionId = `${mobileListboxId}-product-${p.id}`;
            const isActive = activeMobileItemId === optionId;
            return (
              <SearchProductResult
                key={p.id}
                product={p}
                query={mobileInput}
                optionId={optionId}
                active={isActive}
                dark
                previouslyOrdered={previousOrderCodes.has(String(p.code || p.sku || '').toUpperCase())}
                onPick={() => { setMobileInput(''); pickProduct(p); closeMobileSearch(); }}
                onAdd={onSearchAddToCart}
              />
            );
          })}
          {mobileSearchState !== 'loading' && mobileSearchState !== 'error' && mobileSuggestions.length === 0 && mobileCatMatches.length === 0 && (
            <div className="sp-empty sp-empty--mobile">
              <Search size={24} />
              <p>No results for &ldquo;<strong>{mobileInput.trim()}</strong>&rdquo;</p>
              <span>Try a different spelling or browse by department</span>
              <button
                type="button"
                className="sp-request-product"
                onClick={() => {
                  closeMobileSearch();
                  setShowRequest(true);
                }}
              >
                <PackageSearch size={15} /> Request this product
              </button>
            </div>
          )}
        </div>
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showRequest && <ProductRequestModal onClose={() => setShowRequest(false)} />}
    </>
  );
}

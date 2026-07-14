import { useRef, useState, useEffect, useCallback, useId } from 'react';
import {
  Home, Info, LayoutDashboard, LayoutGrid, Loader2, LogOut, Menu, MessageCircle, PackageSearch, RotateCcw,
  Search, ShoppingCart, Star, Upload, User, X,
} from 'lucide-react';
import { getSuggestions } from '../lib/fuzzySearch';
import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';
import categoriesData from '../data/categories.json';
import ProtoLogo from './ProtoLogo';
import AboutModal from './AboutModal';
import './Header.css';

// ─── Recent searches (localStorage) ─────────────────────────
const RS_KEY = 'proto_recent_searches';
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RS_KEY) || '[]'); } catch { return []; }
}
function saveRecent(term) {
  const prev = loadRecent().filter((t) => t.toLowerCase() !== term.toLowerCase());
  const next = [term, ...prev].slice(0, 6);
  try { localStorage.setItem(RS_KEY, JSON.stringify(next)); } catch {}
}
function clearRecent() {
  try { localStorage.removeItem(RS_KEY); } catch {}
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

function ProductRequestModal({ onClose, customer }) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), qty: qty.trim() || null, imageBase64: image.base64, imageName: image.name, imageType: image.type, customerEmail: customer?.email || '', customerName: customer?.name || '' }),
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
}) {
  if (!query.trim()) {
    return (
      <div className="search-panel search-panel--empty" id={listboxId} role="listbox" aria-label="Search suggestions">
        <p className="sp-empty-hint">Start typing to search products…</p>
      </div>
    );
  }

  return (
    <div className="search-panel" id={listboxId} role="listbox" aria-label="Search suggestions">
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

      {/* Product results */}
      {suggestions.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-head">
            <span>Products</span>
            <button
              type="button"
              className="sp-view-all-link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onCommitSearch(query)}
            >
              View all results →
            </button>
          </div>
          {suggestions.map((p) => {
            const optionId = `${listboxId}-product-${p.id}`;
            const isActive = activeItemId === optionId;
            return (
              <button
                key={p.id}
                id={optionId}
                type="button"
                className={`sp-product-row${isActive ? ' active' : ''}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickProduct(p)}
              >
                <div className="sp-product-img">
                  {p.image
                    ? <img src={p.image} alt={p.name} loading="lazy" />
                    : <div className="sp-product-img-empty" />}
                </div>
                <div className="sp-product-info">
                  <span className="sp-product-code">{p.code}</span>
                  <span className="sp-product-name">{p.name}</span>
                </div>
                {p.price > 0 && <span className="sp-product-price">R{p.price.toFixed(2)}</span>}
              </button>
            );
          })}
        </div>
      )}

      {suggestions.length === 0 && catMatches.length === 0 && (
        <div className="sp-empty">
          <Search size={24} />
          <p>No results for "<strong>{query}</strong>"</p>
          <span>Try a different spelling or browse by department above</span>
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
      <ShoppingCart size={size} style={{ color: pct === 0 ? 'currentColor' : '#94a3b8' }} />
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
  onMenuClick, onHome, customer, onViewProfile, onViewAdmin, onReorder, hasLastOrder, onLogout,
  searchQuery, setSearchQuery, navigateForSearch, onSpecials, onCartClick,
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
  const [activeIdx, setActiveIdx] = useState(-1);
  const [mobileActiveIdx, setMobileActiveIdx] = useState(-1);
  const productsCache = useRef(null);
  const productsLoading = useRef(null);
  const inputRef = useRef(null);
  const searchWrapRef = useRef(null);
  const debounceRef = useRef(null);
  const liftRef = useRef(null);
  // Local mirror of the search box text. The parent's `searchQuery` (which
  // drives the catalogue query and re-renders the whole product grid) is only
  // updated on a short debounce, so each keystroke re-renders just this input.
  const [inputValue, setInputValue] = useState(searchQuery);
  const pendingSearchRef = useRef(searchQuery);
  const desktopListboxId = useId();
  const mobileListboxId = useId();

  const loadProductsOnce = useCallback(async () => {
    if (productsCache.current) return productsCache.current;
    if (productsLoading.current) return productsLoading.current;
    productsLoading.current = (async () => {
      try {
        const res = await fetch('/api/products');
        productsCache.current = res.ok ? await res.json() : [];
      } catch {
        try {
          const res = await fetch('/products.json');
          productsCache.current = res.ok ? await res.json() : [];
        } catch {
          productsCache.current = [];
        }
      }
      productsLoading.current = null;
      return productsCache.current;
    })();
    return productsLoading.current;
  }, []);

  const updateSuggestions = useCallback((query, products) => {
    if (!query.trim()) { setSuggestions([]); setCatMatches([]); return; }
    setSuggestions(getSuggestions(products, query, 20));
    setCatMatches(matchCategories(query));
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSuggestions([]);
    setCatMatches([]);
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
    if (!query.trim()) {
      setSuggestions([]);
      setCatMatches([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void loadProductsOnce().then((products) => updateSuggestions(query, products));
    }, 120);
  }, [loadProductsOnce, updateSuggestions]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    void loadProductsOnce();
  }, [loadProductsOnce]);

  const focusSearch = useCallback(() => {
    openSearch();
  }, [openSearch]);

  // Debounced lift to the parent so typing doesn't re-render App + every
  // ProductCard (and re-fire the catalogue fetch) on each keystroke.
  const liftSearch = useCallback((val) => {
    pendingSearchRef.current = val;
    clearTimeout(liftRef.current);
    liftRef.current = setTimeout(() => setSearchQuery(val), 200);
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
    saveRecent(p.name);
    setSearchImmediate(p.name);
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
    setSearchImmediate(term);
    navigateForSearch?.([]);
    setSuggestions([]);
    setCatMatches([]);
    setActiveIdx(-1);
    setSearchOpen(false);
  };

  // Mobile search — mobileInput is the transient typed text, separate from the
  // committed searchQuery so the input clears after a search without losing results.
  const [mobileSuggestions, setMobileSuggestions] = useState([]);
  const [mobileCatMatches, setMobileCatMatches] = useState([]);
  const [mobileInput, setMobileInput] = useState('');
  const openMobileSearch = () => {
    setMobileSearchOpen(true);
    setMobileInput('');
    setMobileActiveIdx(-1);
    void loadProductsOnce();
  };
  const closeMobileSearch = () => {
    setMobileSearchOpen(false);
    setMobileSuggestions([]);
    setMobileCatMatches([]);
    setMobileInput('');
    setMobileActiveIdx(-1);
  };
  const handleMobileInput = (val) => {
    setMobileInput(val);
    liftSearch(val);
    setMobileActiveIdx(-1);
    clearTimeout(debounceRef.current);
    if (!val.trim()) { setMobileSuggestions([]); setMobileCatMatches([]); return; }
    debounceRef.current = setTimeout(() => {
      void loadProductsOnce().then((products) => {
        setMobileSuggestions(getSuggestions(products, val, 12));
        setMobileCatMatches(matchCategories(val));
      });
    }, 120);
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
            <Search size={18} className="header-search-premium__icon" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              className="header-search-premium__input"
              placeholder="Search products, SKU or barcode..."
              value={inputValue}
              onFocus={focusSearch}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search products, SKU or barcode"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-haspopup="listbox"
              aria-controls={desktopListboxId}
              aria-activedescendant={activeDesktopItemId}
            />
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
        <button type="button" className="mobile-tab-bar-btn mobile-tab-bar-btn--cart" onClick={onCartClick}>
          <ShoppingCart size={20} />
          <span>Cart</span>
          {cartItemCount > 0 && <em className="mobile-tab-bar-badge">{cartItemCount}</em>}
        </button>
      </nav>

      {/* Mobile search */}
      <div className={`mobile-action-search-drop${mobileSearchOpen ? ' open' : ''}`}>
        <Search size={16} color="rgba(255,255,255,0.5)" />
        <input
          autoFocus={mobileSearchOpen}
          type="search"
          placeholder="Search products, SKU or barcode..."
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
          aria-label="Search products, SKU or barcode"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mobileSearchOpen && Boolean(mobileInput.trim())}
          aria-haspopup="listbox"
          aria-controls={mobileListboxId}
          aria-activedescendant={activeMobileItemId}
        />
        {mobileInput && (
          <button type="button" onClick={() => { setMobileInput(''); setSearchImmediate(''); setMobileSuggestions([]); setMobileCatMatches([]); }} aria-label="Clear">
            <X size={15} />
          </button>
        )}
        <button type="button" onClick={closeMobileSearch} aria-label="Close"><X size={15} /></button>
      </div>

      {/* Mobile category + product results */}
      {mobileSearchOpen && mobileInput.trim() && (
        <div className="mobile-search-results" id={mobileListboxId} role="listbox" aria-label="Mobile search suggestions">
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
              <button
                key={p.id}
                id={optionId}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`sp-product-row sp-product-row--dark${isActive ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setMobileInput(''); pickProduct(p); closeMobileSearch(); }}
              >
                <div className="sp-product-img">
                  {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <div className="sp-product-img-empty" />}
                </div>
                <div className="sp-product-info">
                  <span className="sp-product-code">{p.code}</span>
                  <span className="sp-product-name">{p.name}</span>
                </div>
                {p.price > 0 && <span className="sp-product-price" style={{ color: '#fff' }}>R{p.price.toFixed(2)}</span>}
              </button>
            );
          })}
          {mobileSuggestions.length === 0 && mobileCatMatches.length === 0 && (
            <div className="sp-empty sp-empty--mobile">
              <Search size={24} />
              <p>No results for &ldquo;<strong>{mobileInput.trim()}</strong>&rdquo;</p>
              <span>Try a different spelling or browse by department</span>
            </div>
          )}
        </div>
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showRequest && <ProductRequestModal onClose={() => setShowRequest(false)} customer={customer} />}
    </>
  );
}

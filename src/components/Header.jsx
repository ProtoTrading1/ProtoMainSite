import { useRef, useState } from 'react';
import {
  Clock, Info, LayoutDashboard, LayoutGrid, Loader2, LogOut, MapPin, MessageCircle, PackageSearch, RotateCcw,
  Search, ShoppingCart, Star, TrendingUp, Upload, User, X,
} from 'lucide-react';
import { getSuggestions } from '../lib/fuzzySearch';
import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';
import categoriesData from '../data/categories.json';

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

const POPULAR = [
  'Seed Beads', 'Glass Beads', 'Acrylic Beads', 'Mixed Beads',
  'Gift Boxes', 'Organza Bags', 'Party Supplies', 'Jewellery Findings',
  'Elastic Cord', 'Gift Wrap',
];

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

function matchCategories(query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  return FLAT_CATS
    .filter((c) => c.label.toLowerCase().includes(q) || q.split(' ').some((w) => w.length > 2 && c.label.toLowerCase().includes(w)))
    .slice(0, 4);
}

// ─── Modals ──────────────────────────────────────────────────
function AboutModal({ onClose }) {
  return (
    <div className="topnav-modal-backdrop" onClick={onClose}>
      <div className="about-modal-dark" onClick={(e) => e.stopPropagation()}>
        <button className="about-modal-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>

        <div className="about-modal-header">
          <span className="about-modal-eyebrow">Since 1987</span>
          <h2 className="about-modal-title">About Proto Trading</h2>
          <p className="about-modal-sub">Serving South African businesses for nearly four decades</p>
        </div>

        <div className="about-modal-body">
          <p>For nearly four decades, Proto Trading has been a trusted partner to retailers, resellers, schools, manufacturers, online sellers, event companies, and businesses across South Africa.</p>
          <p>Established in 1987, Proto Trading has grown from a small wholesale operation into one of South Africa's most diverse importers and distributors, supplying thousands of products across multiple categories from a single source.</p>
          <p>Our success has been built on a simple principle: provide customers with quality products, competitive pricing, reliable service, and long-term value.</p>

          <h3 className="about-modal-section-title">Why customers choose Proto</h3>
          <ul className="about-modal-list">
            {['Extensive product selection', 'Competitive wholesale pricing', 'Consistent stock availability', 'Nationwide supply capability', 'Reliable customer service', 'Long-standing industry experience', 'Commitment to quality and value'].map((item) => (
              <li key={item}><span>✓</span>{item}</li>
            ))}
          </ul>

          <div className="about-modal-stats">
            <div><strong>1987</strong><span>Established</span></div>
            <div><strong>5,000+</strong><span>Product lines</span></div>
            <div><strong>SA-wide</strong><span>Delivery</span></div>
            <div><strong>40 yrs</strong><span>Experience</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FindUsModal({ onClose }) {
  return (
    <div className="topnav-modal-backdrop" onClick={onClose}>
      <div className="topnav-modal" onClick={(e) => e.stopPropagation()}>
        <button className="topnav-modal-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        <h2>Where to Find Us</h2>
        <div className="topnav-find-block">
          <MapPin size={18} />
          <div><strong>Head Office & Warehouse</strong><p>Proto Trading (Pty) Ltd<br />Johannesburg, South Africa</p></div>
        </div>
        <div className="topnav-find-block">
          <Info size={18} />
          <div><strong>Trade enquiries</strong><p>Send a quote request via the order basket<br />and our team will confirm by reply.</p></div>
        </div>
        <p className="topnav-find-note">Trade accounts, delivery areas, and MOQ details are confirmed with your first order.</p>
      </div>
    </div>
  );
}

function ProductRequestModal({ onClose, customer }) {
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('');
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

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
function SearchPanel({ query, suggestions, catMatches, recentSearches, activeIdx, onPickProduct, onPickCategory, onPickTerm, onClearRecent, onCommitSearch }) {
  const isEmpty = !query.trim();
  const topDepts = categoriesData.slice(0, 8);

  if (isEmpty) {
    return (
      <div className="search-panel">
        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div className="sp-section">
            <div className="sp-section-head">
              <span>Recent</span>
              <button type="button" onClick={onClearRecent} className="sp-clear">Clear</button>
            </div>
            <div className="sp-pills">
              {recentSearches.map((t) => (
                <button key={t} type="button" className="sp-pill sp-pill--recent" onClick={() => onPickTerm(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popular searches */}
        <div className="sp-section">
          <div className="sp-section-head">
            <span>Popular right now</span>
          </div>
          <div className="sp-pills">
            {POPULAR.map((t) => (
              <button key={t} type="button" className="sp-pill" onClick={() => onPickTerm(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Department shortcuts */}
        <div className="sp-section">
          <div className="sp-section-head"><span>Browse departments</span></div>
          <div className="sp-dept-grid">
            {topDepts.map((dept) => {
              const color = DEPT_COLORS[dept.id] || '#374151';
              return (
                <button
                  key={dept.id}
                  type="button"
                  className="sp-dept-chip"
                  onClick={() => onPickCategory(dept.path || [dept.id])}
                  style={{ '--chip-color': color }}
                >
                  <span>{dept.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search-panel">
      {/* Category matches */}
      {catMatches.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-head"><span>Categories</span></div>
          {catMatches.map((cat) => {
            const color = DEPT_COLORS[cat.path[0]] || '#374151';
            const Icon = cat.icon ? LUCIDE_ICON_MAP[cat.icon] : null;
            return (
              <button
                key={cat.id}
                type="button"
                className="sp-cat-row"
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
            <button type="button" className="sp-view-all-link" onMouseDown={(e) => { e.preventDefault(); onCommitSearch(query); }}>
              View all results →
            </button>
          </div>
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`sp-product-row${i === activeIdx ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onPickProduct(p); }}
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
          ))}
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

// ─── Header ──────────────────────────────────────────────────
export default function Header({
  cartItemCount, cartTotal,
  onMenuClick, customer, onViewProfile, onViewAdmin, onReorder, hasLastOrder, onLogout,
  searchQuery, setSearchQuery, onSpecials, onCartClick,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFindUs, setShowFindUs] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [catMatches, setCatMatches] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [recentSearches, setRecentSearches] = useState(loadRecent);
  const productsCache = useRef(null);
  const inputRef = useRef(null);

  const loadProductsOnce = async () => {
    if (productsCache.current) return productsCache.current;
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
    return productsCache.current;
  };

  const updateSuggestions = (query, products) => {
    if (!query.trim()) { setSuggestions([]); setCatMatches([]); return; }
    setSuggestions(getSuggestions(products, query, 20));
    setCatMatches(matchCategories(query));
  };

  const openSearch = () => {
    setSearchOpen(true);
    setRecentSearches(loadRecent());
    loadProductsOnce();
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSuggestions([]);
    setCatMatches([]);
    setActiveIdx(-1);
  };

  const handleInput = async (val) => {
    setSearchQuery(val);
    setActiveIdx(-1);
    const products = await loadProductsOnce();
    updateSuggestions(val, products);
  };

  const handleKeyDown = (e) => {
    const items = suggestions;
    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === 'Enter') {
      if (activeIdx >= 0 && items[activeIdx]) {
        pickProduct(items[activeIdx]);
      } else if (searchQuery.trim()) {
        commitSearch(searchQuery.trim());
      }
    }
  };

  const pickProduct = (p) => {
    saveRecent(p.name);
    setRecentSearches(loadRecent());
    setSearchQuery(p.name);
    setSuggestions([]);
    setCatMatches([]);
    setActiveIdx(-1);
    setSearchOpen(false);
  };

  const pickCategory = (path) => {
    window.location.hash = '/' + path.join('/');
    closeSearch();
  };

  const pickTerm = (term) => {
    saveRecent(term);
    setRecentSearches(loadRecent());
    setSearchQuery(term);
    loadProductsOnce().then((products) => updateSuggestions(term, products));
    inputRef.current?.focus();
  };

  const commitSearch = (term) => {
    if (!term) return;
    saveRecent(term);
    setRecentSearches(loadRecent());
    setSuggestions([]);
    setCatMatches([]);
    setActiveIdx(-1);
    setSearchOpen(false);
  };

  const handleClearRecent = () => {
    clearRecent();
    setRecentSearches([]);
  };

  // Mobile search
  const [mobileSuggestions, setMobileSuggestions] = useState([]);
  const [mobileCatMatches, setMobileCatMatches] = useState([]);
  const openMobileSearch = () => {
    setMobileSearchOpen(true);
    setRecentSearches(loadRecent());
    loadProductsOnce();
  };
  const closeMobileSearch = () => {
    setMobileSearchOpen(false);
    setSearchQuery('');
    setMobileSuggestions([]);
    setMobileCatMatches([]);
  };
  const handleMobileInput = async (val) => {
    setSearchQuery(val);
    const products = await loadProductsOnce();
    if (!val.trim()) { setMobileSuggestions([]); setMobileCatMatches([]); return; }
    setMobileSuggestions(getSuggestions(products, val, 12));
    setMobileCatMatches(matchCategories(val));
  };

  return (
    <>
      <header className="app-header">
        {/* Brand */}
        <div className="brand-block">
          <div className="brand-mark brand-logo">
            <img src="/proto-logo.png" alt="Proto Trading logo" />
          </div>
          <div className="brand-copy">
            <strong>PROTO</strong>
            <span>TRADING</span>
          </div>
        </div>

        {/* Centre navigation */}
        <nav className="header-nav desktop-only">
          <button
            className={`header-nav-btn header-nav-btn--search${searchOpen ? ' header-nav-btn--active' : ''}`}
            type="button"
            onClick={searchOpen ? closeSearch : openSearch}
          >
            <Search size={15} />
            Search
          </button>

          {hasLastOrder && (
            <button className="header-nav-btn" type="button" onClick={onReorder}>
              <RotateCcw size={14} />
              Returning Buyer
            </button>
          )}

          <button className="header-nav-btn" type="button" onClick={() => setShowFindUs(true)}>
            <MapPin size={14} />
            Where to Find Us
          </button>

          <button className="header-nav-btn" type="button" onClick={() => setShowAbout(true)}>
            <Info size={14} />
            About Us
          </button>

          <button className="header-nav-btn header-nav-specials" type="button" onClick={onSpecials}>
            <Star size={14} className="spinning-star" />
            This Week's Specials
          </button>
        </nav>

        {/* Right actions */}
        <div className="header-actions">
          {customer?.role === 'admin' && (
            <a className="header-action desktop-only" href="https://protoportal-admin.vercel.app" target="_blank" rel="noreferrer">
              <LayoutDashboard size={19} />
              <span><small>Admin</small>Dashboard</span>
            </a>
          )}

          <button className="header-action desktop-only" type="button" onClick={onViewProfile}>
            <User size={19} />
            <span>
              <small style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {customer?.tier === 'premium' && <Star size={11} fill="#8B1A1A" color="#8B1A1A" />}
                {customer?.tier === 'premium' ? 'Premium' : 'Trade'}
              </small>
              My Profile
            </span>
          </button>

          {onLogout && (
            <button className="header-action desktop-only" type="button" onClick={onLogout} title="Log out" style={{ opacity: 0.75 }}>
              <LogOut size={17} />
            </button>
          )}

          <div className="cart-summary" onClick={onCartClick} style={onCartClick ? { cursor: 'pointer' } : undefined}>
            <CartProgressIcon cartTotal={cartTotal} size={22} />
            <span><small>Order</small>R{cartTotal.toFixed(2)}</span>
          </div>
        </div>
      </header>

      {/* Desktop search overlay */}
      {searchOpen && (
        <>
          <div className="search-overlay-backdrop" onClick={closeSearch} />
          <div className="search-overlay-wrap">
            <div className="search-overlay-bar">
              <Search size={16} color="#64748b" />
              <input
                ref={inputRef}
                autoFocus
                type="text"
                placeholder="Search products, categories, codes…"
                value={searchQuery}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="search-overlay-input"
              />
              <button type="button" onClick={closeSearch} className="search-overlay-close-red" aria-label="Close search">
                <X size={16} />
              </button>
            </div>
            <SearchPanel
              query={searchQuery}
              suggestions={suggestions}
              catMatches={catMatches}
              recentSearches={recentSearches}
              activeIdx={activeIdx}
              onPickProduct={pickProduct}
              onPickCategory={pickCategory}
              onPickTerm={pickTerm}
              onCommitSearch={commitSearch}
              onClearRecent={handleClearRecent}
            />
          </div>
        </>
      )}

      {/* Mobile action bar */}
      <div className="mobile-action-bar">
        <button type="button" onClick={onMenuClick} className="mobile-menu-btn">
          <LayoutGrid size={14} />
          Categories
        </button>
        <button type="button" className={mobileSearchOpen ? 'active' : ''} onClick={mobileSearchOpen ? closeMobileSearch : openMobileSearch}>
          <Search size={14} />
          Search
        </button>
        {hasLastOrder && (
          <button type="button" onClick={onReorder}>
            <RotateCcw size={14} />
            Reorder
          </button>
        )}
        <button type="button" className="specials-btn" onClick={onSpecials}>
          <Star size={14} />
          Specials
        </button>
        <button type="button" onClick={() => setShowAbout(true)}>
          <Info size={14} />
          About Us
        </button>
        <button type="button" onClick={() => setShowFindUs(true)}>
          <MapPin size={14} />
          Find Us
        </button>
      </div>

      {/* Mobile search */}
      <div className={`mobile-action-search-drop${mobileSearchOpen ? ' open' : ''}`}>
        <Search size={16} color="rgba(255,255,255,0.5)" />
        <input
          autoFocus={mobileSearchOpen}
          type="search"
          placeholder="Search products, codes…"
          value={searchQuery}
          onChange={(e) => handleMobileInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeMobileSearch();
            if (e.key === 'Enter' && searchQuery.trim()) { commitSearch(searchQuery.trim()); closeMobileSearch(); }
          }}
        />
        {searchQuery && (
          <button type="button" onClick={() => { setSearchQuery(''); setMobileSuggestions([]); setMobileCatMatches([]); }} aria-label="Clear">
            <X size={15} />
          </button>
        )}
        <button type="button" onClick={closeMobileSearch} aria-label="Close"><X size={15} /></button>
      </div>

      {/* Mobile category + product results */}
      {mobileSearchOpen && (mobileSuggestions.length > 0 || mobileCatMatches.length > 0 || !searchQuery) && (
        <div className="mobile-search-results">
          {!searchQuery && recentSearches.length > 0 && (
            <div className="sp-section">
              <div className="sp-section-head">
                <Clock size={12} />
                <span>Recent</span>
                <button type="button" onClick={handleClearRecent} className="sp-clear">Clear</button>
              </div>
              <div className="sp-pills">
                {recentSearches.map((t) => (
                  <button key={t} type="button" className="sp-pill sp-pill--recent" onClick={() => { setSearchQuery(t); handleMobileInput(t); }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mobileCatMatches.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="sp-cat-row sp-cat-row--dark"
              onMouseDown={(e) => { e.preventDefault(); pickCategory(cat.path); closeMobileSearch(); }}
            >
              <span className="sp-cat-label">{cat.label}</span>
              <span className="sp-cat-arrow">→</span>
            </button>
          ))}
          {mobileSuggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              className="sp-product-row sp-product-row--dark"
              onMouseDown={(e) => { e.preventDefault(); pickProduct(p); closeMobileSearch(); }}
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
          ))}
        </div>
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showFindUs && <FindUsModal onClose={() => setShowFindUs(false)} />}
      {showRequest && <ProductRequestModal onClose={() => setShowRequest(false)} customer={customer} />}
    </>
  );
}

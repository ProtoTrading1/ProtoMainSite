import { useRef, useState } from 'react';
import {
  Clock, Info, LayoutDashboard, LayoutGrid, LogOut, MapPin, RotateCcw,
  Search, ShoppingCart, Star, TrendingUp, User, X,
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
      <div className="topnav-modal" onClick={(e) => e.stopPropagation()}>
        <button className="topnav-modal-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        <h2>About Proto Trading</h2>
        <p>Established in 1987, Proto Trading is a South African wholesale supplier serving independent retailers and trade buyers across the country.</p>
        <p>We stock over 5,000 catalogue lines — from household goods to seasonal specials — with competitive trade pricing, reliable stock, and a sales team that actually picks up the phone.</p>
        <p>Build your basket here and send us a quote request. We confirm availability, pricing, and delivery by reply — usually same day.</p>
        <div className="topnav-modal-stat-row">
          <div><strong>1987</strong><span>Est.</span></div>
          <div><strong>5,000+</strong><span>Lines</span></div>
          <div><strong>SA-wide</strong><span>Delivery</span></div>
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

// ─── Search overlay panel ─────────────────────────────────────
function SearchPanel({ query, suggestions, catMatches, recentSearches, activeIdx, onPickProduct, onPickCategory, onPickTerm, onClearRecent }) {
  const isEmpty = !query.trim();
  const topDepts = categoriesData.slice(0, 8);

  if (isEmpty) {
    return (
      <div className="search-panel">
        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div className="sp-section">
            <div className="sp-section-head">
              <Clock size={12} />
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
            <TrendingUp size={12} />
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
              const Icon = LUCIDE_ICON_MAP[dept.icon] || null;
              return (
                <button
                  key={dept.id}
                  type="button"
                  className="sp-dept-chip"
                  onClick={() => onPickCategory(dept.path || [dept.id])}
                  style={{ '--chip-color': color }}
                >
                  {Icon && <span className="sp-dept-icon" style={{ background: `${color}18`, color }}><Icon size={13} /></span>}
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
            <span className="sp-result-count">{suggestions.length} results</span>
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
    setSuggestions(getSuggestions(products, query, 6));
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
    setMobileSuggestions(getSuggestions(products, val, 5));
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
            className={`header-nav-btn${searchOpen ? ' header-nav-btn--active' : ''}`}
            type="button"
            onClick={searchOpen ? closeSearch : openSearch}
          >
            <Search size={14} />
            Search
          </button>

          {hasLastOrder && (
            <button className="header-nav-btn" type="button" onClick={onReorder}>
              <RotateCcw size={14} />
              Returning Buyer
            </button>
          )}

          <button className="header-nav-btn header-nav-specials" type="button" onClick={onSpecials}>
            <Star size={14} />
            This Week's Specials
          </button>

          <button className="header-nav-btn" type="button" onClick={() => setShowAbout(true)}>
            <Info size={14} />
            About Us
          </button>

          <button className="header-nav-btn" type="button" onClick={() => setShowFindUs(true)}>
            <MapPin size={14} />
            Where to Find Us
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
            <span><small>{customer?.tier === 'premium' ? '★ Premium' : 'Trade'}</small>My Profile</span>
          </button>

          {onLogout && (
            <button className="header-action desktop-only" type="button" onClick={onLogout} title="Log out" style={{ opacity: 0.75 }}>
              <LogOut size={17} />
            </button>
          )}

          <div className="cart-summary" onClick={onCartClick} style={onCartClick ? { cursor: 'pointer' } : undefined}>
            <ShoppingCart size={22} />
            <span className="cart-count">{cartItemCount}</span>
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
                type="search"
                placeholder="Search products, categories, codes…"
                value={searchQuery}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="search-overlay-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(''); setSuggestions([]); setCatMatches([]); inputRef.current?.focus(); }} aria-label="Clear">
                  <X size={15} />
                </button>
              )}
              <button type="button" onClick={closeSearch} className="search-overlay-close">
                <X size={15} />
                <span>Esc</span>
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
    </>
  );
}

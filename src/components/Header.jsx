import { useRef, useState } from 'react';
import {
  Info, LayoutDashboard, LogOut, MapPin, RotateCcw,
  Search, ShoppingCart, Star, User, X,
} from 'lucide-react';
import { getSuggestions } from '../lib/fuzzySearch';

function AboutModal({ onClose }) {
  return (
    <div className="topnav-modal-backdrop" onClick={onClose}>
      <div className="topnav-modal" onClick={(e) => e.stopPropagation()}>
        <button className="topnav-modal-close" onClick={onClose} type="button" aria-label="Close">
          <X size={18} />
        </button>
        <h2>About Proto Trading</h2>
        <p>
          Established in 1987, Proto Trading is a South African wholesale supplier serving
          independent retailers and trade buyers across the country.
        </p>
        <p>
          We stock over 5,000 catalogue lines — from household goods to seasonal specials —
          with competitive trade pricing, reliable stock, and a sales team that actually
          picks up the phone.
        </p>
        <p>
          Build your basket here and send us a quote request. We confirm availability,
          pricing, and delivery by reply — usually same day.
        </p>
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
        <button className="topnav-modal-close" onClick={onClose} type="button" aria-label="Close">
          <X size={18} />
        </button>
        <h2>Where to Find Us</h2>
        <div className="topnav-find-block">
          <MapPin size={18} />
          <div>
            <strong>Head Office & Warehouse</strong>
            <p>Proto Trading (Pty) Ltd<br />Johannesburg, South Africa</p>
          </div>
        </div>
        <div className="topnav-find-block">
          <Info size={18} />
          <div>
            <strong>Trade enquiries</strong>
            <p>Send a quote request via the order basket<br />and our team will confirm by reply.</p>
          </div>
        </div>
        <p className="topnav-find-note">
          Trade accounts, delivery areas, and MOQ details are confirmed with your first order.
        </p>
      </div>
    </div>
  );
}

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
  const [activeIdx, setActiveIdx] = useState(-1);
  const productsCache = useRef(null);

  const loadProductsOnce = async () => {
    if (productsCache.current) return productsCache.current;
    try {
      const res = await fetch('/products.json');
      productsCache.current = await res.json();
    } catch {
      productsCache.current = [];
    }
    return productsCache.current;
  };

  const updateSuggestions = (query, products) => {
    if (!query.trim()) { setSuggestions([]); return; }
    setSuggestions(getSuggestions(products, query, 8));
  };

  const toggleSearch = () => {
    setSearchOpen((v) => {
      if (v) { setSearchQuery(''); setSuggestions([]); setActiveIdx(-1); }
      else loadProductsOnce();
      return !v;
    });
  };

  const toggleMobileSearch = () => {
    setMobileSearchOpen((v) => {
      if (v) { setSearchQuery(''); setSuggestions([]); setActiveIdx(-1); }
      else loadProductsOnce();
      return !v;
    });
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') { toggleSearch(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === 'Enter' && activeIdx >= 0 && suggestions[activeIdx]) {
      e.preventDefault();
      setSearchQuery(suggestions[activeIdx].name);
      setSuggestions([]);
      setActiveIdx(-1);
    }
  };

  const pickSuggestion = (name) => {
    setSearchQuery(name);
    setSuggestions([]);
    setActiveIdx(-1);
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
            onClick={toggleSearch}
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
            <button className="header-action desktop-only" type="button" onClick={onViewAdmin}>
              <LayoutDashboard size={19} />
              <span>
                <small>Admin</small>
                Dashboard
              </span>
            </button>
          )}

          <button className="header-action desktop-only" type="button" onClick={onViewProfile}>
            <User size={19} />
            <span>
              <small>{customer?.tier === 'premium' ? '★ Premium' : 'Trade'}</small>
              My Profile
            </span>
          </button>

          {onLogout && (
            <button className="header-action desktop-only" type="button" onClick={onLogout} title="Log out" style={{ opacity: 0.75 }}>
              <LogOut size={17} />
            </button>
          )}

          <div className="cart-summary" onClick={onCartClick} style={onCartClick ? { cursor: 'pointer' } : undefined}>
            <ShoppingCart size={22} />
            <span className="cart-count">{cartItemCount}</span>
            <span>
              <small>Order</small>
              R{cartTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </header>

      {/* Desktop search bar */}
      {searchOpen && (
        <div className="search-drop-wrap">
          <div className="header-search-drop">
            <Search size={16} />
            <input
              autoFocus
              type="search"
              placeholder="Search products, codes, categories…"
              value={searchQuery}
              onChange={async (e) => {
                setSearchQuery(e.target.value);
                setActiveIdx(-1);
                const products = await loadProductsOnce();
                updateSuggestions(e.target.value, products);
              }}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); setSuggestions([]); }} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
            <button type="button" onClick={toggleSearch} aria-label="Close search">
              <X size={15} />
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="search-suggestions">
              <span className="search-suggestions-label">Suggestions</span>
              {suggestions.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`search-suggestion-item${i === activeIdx ? ' active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(p.name); }}
                >
                  <span className="search-suggestion-code">{p.code}</span>
                  <span className="search-suggestion-name">{p.name}</span>
                  {p.price > 0 && <span className="search-suggestion-price">R{p.price.toFixed(2)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mobile action bar */}
      <div className="mobile-action-bar">
        <button type="button" className={mobileSearchOpen ? 'active' : ''} onClick={toggleMobileSearch}>
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

      {/* Mobile search input */}
      <div className={`mobile-action-search-drop${mobileSearchOpen ? ' open' : ''}`}>
        <Search size={16} color="rgba(255,255,255,0.5)" />
        <input
          autoFocus={mobileSearchOpen}
          type="search"
          placeholder="Search products, codes…"
          value={searchQuery}
          onChange={async (e) => {
            setSearchQuery(e.target.value);
            setActiveIdx(-1);
            const products = await loadProductsOnce();
            updateSuggestions(e.target.value, products);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') toggleMobileSearch();
            if (e.key === 'Enter' && activeIdx >= 0 && suggestions[activeIdx]) {
              e.preventDefault();
              pickSuggestion(suggestions[activeIdx].name);
            }
          }}
        />
        {searchQuery && (
          <button type="button" onClick={() => { setSearchQuery(''); setSuggestions([]); }} aria-label="Clear">
            <X size={15} />
          </button>
        )}
        <button type="button" onClick={toggleMobileSearch} aria-label="Close">
          <X size={15} />
        </button>
      </div>
      {mobileSearchOpen && suggestions.length > 0 && (
        <div className="search-suggestions" style={{ position: 'relative', borderTop: '1px solid #e2e8f0', borderRadius: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`search-suggestion-item${i === activeIdx ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pickSuggestion(p.name); toggleMobileSearch(); }}
            >
              <span className="search-suggestion-code">{p.code}</span>
              <span className="search-suggestion-name">{p.name}</span>
              {p.price > 0 && <span className="search-suggestion-price">R{p.price.toFixed(2)}</span>}
            </button>
          ))}
        </div>
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showFindUs && <FindUsModal onClose={() => setShowFindUs(false)} />}
    </>
  );
}

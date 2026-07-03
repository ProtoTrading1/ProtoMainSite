import { useState } from 'react';
import { MapPin, Info, Search, Star, X } from 'lucide-react';
import { PROTO_OFFICE_ADDRESS } from '../lib/brandAssets';

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
            <strong>{PROTO_OFFICE_ADDRESS.label}</strong>
            <p>
              {PROTO_OFFICE_ADDRESS.company}
              <br />
              {PROTO_OFFICE_ADDRESS.street}
              <br />
              {PROTO_OFFICE_ADDRESS.area}
            </p>
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

export default function TopNav({ searchQuery, setSearchQuery, onSpecials }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFindUs, setShowFindUs] = useState(false);

  const toggleSearch = () => {
    setSearchOpen((v) => {
      if (v) setSearchQuery('');
      return !v;
    });
  };

  return (
    <>
      <div className="top-nav">
        <div className="top-nav-bar">
          <button
            className={`top-nav-link top-nav-search-btn${searchOpen ? ' active' : ''}`}
            type="button"
            onClick={toggleSearch}
            aria-label="Search products"
          >
            <Search size={14} />
            <span>Search</span>
          </button>

          <span className="top-nav-sep" />

          <button className="top-nav-link top-nav-specials" type="button" onClick={onSpecials}>
            <Star size={14} />
            <span>This Week's Specials</span>
          </button>

          <span className="top-nav-sep" />

          <button className="top-nav-link" type="button" onClick={() => setShowAbout(true)}>
            <span>About Us</span>
          </button>

          <span className="top-nav-sep" />

          <button className="top-nav-link" type="button" onClick={() => setShowFindUs(true)}>
            <MapPin size={14} />
            <span>Where to Find Us</span>
          </button>
        </div>

        {searchOpen && (
          <div className="top-nav-search-bar">
            <Search size={16} />
            <input
              autoFocus
              type="search"
              placeholder="Search products, codes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') toggleSearch();
              }}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
            <button type="button" className="top-nav-search-close" onClick={toggleSearch} aria-label="Close search">
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showFindUs && <FindUsModal onClose={() => setShowFindUs(false)} />}
    </>
  );
}

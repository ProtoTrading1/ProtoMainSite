import React from 'react';
import { LayoutDashboard, LogOut, Menu, RotateCcw, Search, ShoppingCart, User } from 'lucide-react';

export default function Header({
  cartItemCount, cartTotal, searchQuery = '', setSearchQuery = () => {},
  onMenuClick, customer, onViewProfile, onViewAdmin, onReorder, hasLastOrder, onLogout,
}) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <button className="icon-button mobile-menu-button" onClick={onMenuClick} aria-label="Open categories">
          <Menu size={21} />
        </button>
        <div className="brand-mark brand-logo">
          <img src="/proto-logo.png" alt="Proto Trading logo" />
        </div>
        <div className="brand-copy">
          <strong>PROTO</strong>
          <span>TRADING</span>
        </div>
      </div>

      <div className="header-search">
        <Search size={19} />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search products, codes — typos OK"
        />
      </div>

      <div className="header-actions">
        {hasLastOrder && (
          <button className="header-action desktop-only" type="button" onClick={onReorder}>
            <RotateCcw size={19} />
            <span>
              <small>Returning buyer</small>
              Reorder
            </span>
          </button>
        )}

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
          <button className="header-action desktop-only" type="button" onClick={onLogout} title="Log out" style={{ opacity: 0.6 }}>
            <LogOut size={17} />
          </button>
        )}

        <div className="cart-summary">
          <ShoppingCart size={22} />
          <span className="cart-count">{cartItemCount}</span>
          <span>
            <small>Order</small>
            R{cartTotal.toFixed(2)}
          </span>
        </div>
      </div>
    </header>
  );
}

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Breadcrumb
 * Receives:
 *   crumbs   - array of { id, label, path } built by buildBreadcrumb()
 *   navigate - nav function from useHashNav
 */
export default function Breadcrumb({ crumbs, navigate }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
      {/* Root */}
      <button
        onClick={() => navigate([])}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          fontSize: '13px', fontWeight: crumbs.length === 0 ? '700' : '500',
          color: crumbs.length === 0 ? '#DC2626' : '#6B7280',
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px',
          transition: 'color 0.12s'
        }}
        onMouseEnter={e => { if (crumbs.length > 0) e.currentTarget.style.color = '#111827'; }}
        onMouseLeave={e => { if (crumbs.length > 0) e.currentTarget.style.color = '#6B7280'; }}
      >
        <Home size={13} />
        All Products
      </button>

      {/* Segments */}
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.id}>
            <ChevronRight size={13} color="#D1D5DB" style={{ flexShrink: 0 }} />
            <button
              onClick={() => navigate(crumb.path)}
              style={{
                fontSize: '13px', fontWeight: isLast ? '700' : '500',
                color: isLast ? '#111827' : '#6B7280',
                background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer',
                padding: '2px 4px', borderRadius: '4px',
                transition: 'color 0.12s', pointerEvents: isLast ? 'none' : 'auto'
              }}
              onMouseEnter={e => { if (!isLast) e.currentTarget.style.color = '#111827'; }}
              onMouseLeave={e => { if (!isLast) e.currentTarget.style.color = '#6B7280'; }}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

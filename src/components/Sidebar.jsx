import React, { useState, useRef, useCallback } from 'react';
import CategoryNav from './CategoryNav';
import MegaMenu from './MegaMenu';

export default function Sidebar({ categories, path, navigate, refinements, setRefinement, counts }) {
  const [hoveredL1Id, setHoveredL1Id] = useState(null);
  const closeTimer = useRef(null);

  const hoveredL1Node = hoveredL1Id ? categories.find(c => c.id === hoveredL1Id) : null;
  const menuOpen = !!hoveredL1Node && !!(hoveredL1Node.children?.length);

  const openMenu = useCallback((id) => {
    clearTimeout(closeTimer.current);
    setHoveredL1Id(id);
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setHoveredL1Id(null), 160);
  }, []);

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimer.current);
  }, []);

  const closeMenu = useCallback(() => {
    clearTimeout(closeTimer.current);
    setHoveredL1Id(null);
  }, []);

  return (
    <div
      className="sidebar-container"
      style={{
        position: 'relative',
        height: '100%',
        backgroundColor: '#fff',
        zIndex: 100,
      }}
      onMouseLeave={scheduleClose}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative',
          zIndex: 210,
        }}
      >
        <div style={{ padding: '14px 16px 6px', borderBottom: '1px solid #F0F1F3', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Browse Categories
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>
          <CategoryNav
            categories={categories}
            path={path}
            navigate={navigate}
            counts={counts}
            onHoverL1={openMenu}
            hoveredL1Id={hoveredL1Id}
          />
        </div>
      </div>

      {menuOpen && (
        <div
          onMouseEnter={cancelClose}
          style={{
            position: 'absolute',
            left: '100%',
            top: 0,
            bottom: 0,
            zIndex: 300,
            pointerEvents: 'auto',
          }}
        >
          <MegaMenu
            key={hoveredL1Node.id}
            l1Node={hoveredL1Node}
            navigate={navigate}
            setRefinement={setRefinement}
            counts={counts}
            onClose={closeMenu}
            sidebarW={0}
            headerH={0}
            stickyH={0}
          />
        </div>
      )}

      {menuOpen && (
        <div
          onClick={closeMenu}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            cursor: 'default',
            backgroundColor: 'rgba(0,0,0,0.02)',
          }}
        />
      )}
    </div>
  );
}

import React from 'react';
import { ChevronRight, ChevronDown, LayoutGrid, Filter, Check } from 'lucide-react';
import * as Icons from 'lucide-react';

const ICON_MAP = {
  Briefcase: Icons.Briefcase, Scissors:  Icons.Scissors,
  ToyBrick:  Icons.Gamepad2,  PenTool:   Icons.PenTool,
  Home:      Icons.Home,      Smile:     Icons.Smile,
  Shirt:     Icons.Shirt,     Cookie:    Icons.Cookie,
  Wind:      Icons.Wind,      Utensils:  Icons.Utensils,
  Gift:      Icons.Gift,      Package:   Icons.Package,
  Wrench:    Icons.Wrench,    Snowflake: Icons.Snowflake,
  Tags:      Icons.Tags,
};

export default function CategoryNav({ categories, path, navigate, onHoverL1, hoveredL1Id, counts }) {
  const activeL1 = path?.[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 0' }}>
      {/* All Products */}
      <button
        onClick={() => { navigate([]); onHoverL1(null); }}
        onMouseEnter={() => onHoverL1(null)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', margin: '0 8px 8px', borderRadius: '8px',
          border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          backgroundColor: !activeL1 ? '#111827' : '#F9FAFB',
          color: !activeL1 ? '#fff' : '#374151',
          transition: 'all 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LayoutGrid size={16} color={!activeL1 ? '#fff' : '#9CA3AF'} />
          <span style={{ fontSize: '13px', fontWeight: '700' }}>
            All Products
          </span>
        </div>
        <span style={{ fontSize: '11px', color: !activeL1 ? 'rgba(255,255,255,0.6)' : '#9CA3AF', fontWeight: '600' }}>
          {counts?.[''] ?? '0'}
        </span>
      </button>

      {/* L1 Categories Only */}
      {categories.map(cat => {
        const Icon = ICON_MAP[cat.icon] || Icons.FolderOpen;
        const isActive = activeL1 === cat.id;
        const isHovered = hoveredL1Id === cat.id;

        return (
          <button
            key={cat.id}
            onClick={() => { navigate([cat.id]); onHoverL1(null); }}
            onMouseEnter={() => onHoverL1(cat.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', margin: '0 8px 1px', borderRadius: '7px',
              border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              borderLeft: `3px solid ${isActive ? '#DC2626' : 'transparent'}`,
              backgroundColor: isActive ? '#FEF2F2' : isHovered ? '#F9FAFB' : 'transparent',
              transition: 'background-color 0.1s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <Icon size={16} color={isActive ? '#DC2626' : '#9CA3AF'} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: '13px', fontWeight: isActive ? '700' : '500',
                color: isActive ? '#DC2626' : '#374151',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {cat.label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {counts?.[cat.id] != null && (
                <span style={{ fontSize: '11px', color: isActive ? '#DC2626' : '#9CA3AF', fontWeight: '600' }}>{counts[cat.id]}</span>
              )}
              <ChevronRight size={13} color={isActive ? '#DC2626' : '#D1D5DB'} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

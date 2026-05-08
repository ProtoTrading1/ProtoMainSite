import React, { useState } from 'react';
import { ChevronRight, Filter, Check, ArrowRight } from 'lucide-react';

function ColItem({ label, count, hasChildren, isActive, onClick, onHover }) {
  return (
    <button
      onMouseEnter={onHover}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', width: '100%', border: 'none', textAlign: 'left',
        borderLeft: `3px solid ${isActive ? '#DC2626' : 'transparent'}`,
        backgroundColor: isActive ? '#FEF2F2' : 'transparent',
        cursor: 'pointer', transition: 'all 0.15s ease',
        fontFamily: 'inherit', borderRadius: '4px', margin: '1px 4px'
      }}
    >
      <span style={{ 
        fontSize: '13.5px', 
        fontWeight: isActive ? '700' : '500', 
        color: isActive ? '#DC2626' : '#374151',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
        {count != null && <span style={{ fontSize: '11px', color: isActive ? '#EF4444' : '#9CA3AF', fontWeight: '600' }}>{count}</span>}
        {hasChildren && <ChevronRight size={14} color={isActive ? '#DC2626' : '#D1D5DB'} />}
      </div>
    </button>
  );
}

function ColHeader({ parent, current }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F0F1F3', flexShrink: 0, backgroundColor: '#FAFAFA' }}>
      {parent && <div style={{ fontSize: '10px', fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{parent}</div>}
      <div style={{ fontSize: '15px', fontWeight: '900', color: '#111827', letterSpacing: '-0.2px' }}>{current}</div>
    </div>
  );
}

export default function MegaMenu({ l1Node, navigate, setRefinement, counts, onClose, sidebarW, headerH, stickyH }) {
  const [activeL2Id, setActiveL2Id] = useState(() => l1Node?.children?.[0]?.id || null);
  const [activeL3Id, setActiveL3Id] = useState(() => {
    const firstL2 = l1Node?.children?.[0];
    return firstL2?.children?.[0]?.id || null;
  });

  if (!l1Node) return null;

  const l2Items = l1Node.children || [];
  const activeL2 = l2Items.find(i => i.id === activeL2Id) || null;
  const l3Items = activeL2?.children || [];
  const activeL3 = l3Items.find(i => i.id === activeL3Id) || null;
  const l4Items = activeL3?.children || [];

  const refinements = l1Node.refinements || {};

  const cnt = (path) => counts?.[path.join('/')] ?? null;
  const go = (path) => { navigate(path); onClose(); };

  return (
    <div style={{
      position: 'absolute', 
      left: sidebarW, 
      top: headerH, 
      bottom: stickyH,
      display: 'flex', 
      zIndex: 300, 
      backgroundColor: '#fff',
      boxShadow: '10px 0 40px rgba(0,0,0,0.15)',
      borderRight: '1px solid #E2E4E9', 
      overflow: 'hidden',
      animation: 'fadeIn 0.2s ease-out'
    }}>

      {/* ── Column 1: Level 2 (Sub-categories) ── */}
      <div style={{ width: 220, height: '100%', overflowY: 'auto', borderRight: '1px solid #F0F1F3', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
        <ColHeader current={l1Node.label} />
        <div style={{ padding: '8px 0' }}>
          <button 
            onClick={() => go([l1Node.id])}
            style={{ width: 'calc(100% - 16px)', margin: '0 8px 8px', padding: '10px', borderRadius: '6px', backgroundColor: '#FEF2F2', border: 'none', color: '#DC2626', fontWeight: '700', fontSize: '13px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            All {l1Node.label} <ArrowRight size={14} />
          </button>
          {l2Items.map(item => (
            <ColItem
              key={item.id}
              label={item.label}
              count={cnt([l1Node.id, item.id])}
              hasChildren={!!(item.children?.length)}
              isActive={activeL2Id === item.id}
              onHover={() => { setActiveL2Id(item.id); setActiveL3Id(item.children?.[0]?.id || null); }}
              onClick={() => go([l1Node.id, item.id])}
            />
          ))}
        </div>
      </div>

      {/* ── Column 2: Level 3 (Product Groups) ── */}
      {activeL2 && l3Items.length > 0 && (
        <div style={{ width: 220, height: '100%', overflowY: 'auto', borderRight: '1px solid #F0F1F3', display: 'flex', flexDirection: 'column', backgroundColor: '#FAFAFA' }}>
          <ColHeader parent={l1Node.label} current={activeL2.label || ''} />
          <div style={{ padding: '8px 0' }}>
            <button 
              onClick={() => go([l1Node.id, activeL2.id])}
              style={{ width: 'calc(100% - 16px)', margin: '0 8px 8px', padding: '10px', borderRadius: '6px', backgroundColor: '#E2E4E9', border: 'none', color: '#111827', fontWeight: '700', fontSize: '12px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              View all {activeL2.label} <ArrowRight size={13} />
            </button>
            {l3Items.map(item => (
              <ColItem
                key={item.id}
                label={item.label}
                count={cnt([l1Node.id, activeL2.id, item.id])}
                hasChildren={!!(item.children?.length)}
                isActive={activeL3Id === item.id}
                onHover={() => setActiveL3Id(item.id)}
                onClick={() => go([l1Node.id, activeL2.id, item.id])}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Column 3: Level 4 (Product Types) & Refinements ── */}
      <div style={{ width: 260, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
        <ColHeader parent={activeL2?.label} current={activeL3?.label || 'Refine'} />
        <div style={{ padding: '12px' }}>
          {activeL3 && (
            <button 
              onClick={() => go([l1Node.id, activeL2Id, activeL3Id])}
              style={{ width: '100%', marginBottom: '20px', padding: '10px', borderRadius: '6px', backgroundColor: '#F3F4F6', border: 'none', color: '#111827', fontWeight: '800', fontSize: '12px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              View all {activeL3.label} <ArrowRight size={13} />
            </button>
          )}
          
          {/* L4 Categories */}
          {l4Items.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Product Types</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {l4Items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => go([l1Node.id, activeL2Id, activeL3Id, item.id])}
                    style={{ 
                      padding: '8px 12px', border: 'none', borderRadius: '6px', textAlign: 'left',
                      backgroundColor: 'transparent', color: '#374151', fontSize: '13px', fontWeight: '500',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span>{item.label}</span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{cnt([l1Node.id, activeL2Id, activeL3Id, item.id])}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Refinements */}
          {Object.entries(refinements).map(([key, options]) => (
            <div key={key} style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>{key}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => {
                      const p = activeL3 ? [l1Node.id, activeL2Id, activeL3Id] : [l1Node.id, activeL2Id];
                      navigate(p);
                      setRefinement(key, opt);
                      onClose();
                    }}
                    style={{
                      padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                      backgroundColor: '#fff', border: '1px solid #E2E4E9', color: '#4B5563',
                      cursor: 'pointer', transition: 'all 0.12s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.color = '#DC2626'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E4E9'; e.currentTarget.style.color = '#4B5563'; }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Quick Filters */}
          <div style={{ marginTop: '12px', paddingTop: '16px', borderTop: '1px solid #F0F1F3' }}>
            {[{ key: 'inStock', label: '✓ In Stock Only' }, { key: 'newStock', label: '✦ New Arrivals' }].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  const p = activeL3 ? [l1Node.id, activeL2Id, activeL3Id] : [l1Node.id, activeL2Id];
                  navigate(p);
                  setRefinement(key, 'true');
                  onClose();
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                  border: 'none', borderRadius: '6px', marginBottom: '4px',
                  fontSize: '13px', fontWeight: '700', color: '#111827',
                  backgroundColor: '#F9FAFB', cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

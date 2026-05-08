import React from 'react';
import { X, ChevronLeft, ChevronRight, LayoutGrid, ArrowRight, Filter } from 'lucide-react';
import { findNodeByPath } from '../hooks/useHashNav';

export default function MobileNav({ isOpen, onClose, categories, path, navigate, counts, breadcrumb }) {
  if (!isOpen) return null;

  // Determine which level of categories to show
  let currentCategories = categories;
  if (path && path.length > 0) {
    let node = categories;
    for (const segmentId of path) {
      const found = node.find(n => n.id === segmentId);
      if (found && found.children) {
        node = found.children;
      } else {
        node = []; // No children or reached end
        break;
      }
    }
    currentCategories = node;
  }

  const currentLabel = breadcrumb.length > 0 
    ? breadcrumb[breadcrumb.length - 1].label 
    : 'All Categories';

  const handleSelect = (id) => {
    navigate([...path, id]);
  };

  const handleBack = () => {
    navigate(path.slice(0, -1));
  };

  const currentNode = breadcrumb.length > 0 
    ? findNodeByPath(categories, path)
    : null;

  const refinements = currentNode?.refinements || {};

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'flex-start'
    }}>
      {/* Drawer Panel */}
      <div style={{
        width: '85%', maxWidth: '320px', height: '100%',
        backgroundColor: '#fff', display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 20px rgba(0,0,0,0.2)',
        animation: 'slideIn 0.3s ease-out'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '20px 16px', borderBottom: '1px solid #E2E4E9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: '#111827', color: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {path.length > 0 ? (
              <button onClick={handleBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
                <ChevronLeft size={24} />
              </button>
            ) : (
              <LayoutGrid size={22} color="#DC2626" />
            )}
            <span style={{ fontSize: '18px', fontWeight: '800' }}>{currentLabel}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {/* Back Action */}
          {path.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderBottom: '4px solid #F3F4F6', marginBottom: '8px' }}>
              <button
                onClick={handleBack}
                style={{
                  width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px',
                  border: 'none', background: '#FEF2F2',
                  textAlign: 'left', cursor: 'pointer'
                }}
              >
                <ChevronLeft size={20} color="#DC2626" />
                <span style={{ fontSize: '15px', fontWeight: '800', color: '#DC2626' }}>Go Back One Level</span>
              </button>
              <button
                onClick={() => { navigate([]); }}
                style={{
                  width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                  border: 'none', background: '#fff',
                  textAlign: 'left', cursor: 'pointer'
                }}
              >
                <LayoutGrid size={18} color="#9CA3AF" />
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#6B7280' }}>Return to All Products</span>
              </button>
            </div>
          )}

          {/* Category List */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {path.length > 0 && (
              <button
                onClick={() => { navigate(path); onClose(); }}
                style={{
                  width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: 'none', background: '#FFF7F7', borderBottom: '2px solid #FEF2F2',
                  textAlign: 'left', cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <LayoutGrid size={16} color="#DC2626" />
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#DC2626' }}>View all {currentLabel}</span>
                </div>
                <ArrowRight size={16} color="#DC2626" />
              </button>
            )}

            {currentCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleSelect(cat.id)}
                style={{
                  width: '100%', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: 'none', background: 'none', borderBottom: '1px solid #F3F4F6',
                  textAlign: 'left', cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{cat.label}</span>
                  {counts?.[ [...path, cat.id].join('/') ] != null && (
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600' }}>
                      ({counts[ [...path, cat.id].join('/') ]})
                    </span>
                  )}
                </div>
                {cat.children && cat.children.length > 0 && <ChevronRight size={18} color="#D1D5DB" />}
              </button>
            ))}
          </div>

          {/* Refinements (if no more children) */}
          {currentCategories.length === 0 && Object.keys(refinements).length > 0 && (
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Filter size={16} color="#6B7280" />
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Refine Results</span>
              </div>
              {Object.entries(refinements).map(([key, options]) => (
                <div key={key} style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '10px', textTransform: 'capitalize' }}>{key}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => { navigate(path); setRefinement(key, opt); onClose(); }}
                        style={{
                          padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
                          backgroundColor: '#F9FAFB', border: '1px solid #E2E4E9', color: '#4B5563'
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentCategories.length === 0 && Object.keys(refinements).length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '20px' }}>End of category tree</div>
              <button 
                onClick={onClose}
                style={{ 
                  padding: '12px 24px', borderRadius: '8px', backgroundColor: '#DC2626', color: '#fff', 
                  border: 'none', fontWeight: '700', cursor: 'pointer' 
                }}
              >
                Show {currentLabel}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid #E2E4E9', backgroundColor: '#F9FAFB' }}>
          <button 
            onClick={onClose}
            style={{ 
              width: '100%', padding: '14px', borderRadius: '8px', 
              backgroundColor: '#111827', color: '#fff', border: 'none', 
              fontWeight: '700', fontSize: '14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            Show Results <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Backdrop Click */}
      <div style={{ flex: 1 }} onClick={onClose} />

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

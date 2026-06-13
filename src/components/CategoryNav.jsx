import { Home } from 'lucide-react';
import { DEPT_COLORS } from '../lib/navConfig';
import { lookupProductCount } from '../lib/taxonomy';

const RED = '#7F1D1D';

function Count({ value }) {
  if (value == null) return null;
  return (
    <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '600', marginLeft: '5px' }}>
      {value}
    </span>
  );
}

export default function CategoryNav({ categories, path, navigate, onToggleL1, openCategoryId, counts }) {
  const activeL1 = path?.[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px', borderBottom: '1px solid #F0F1F3',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          All Categories
        </span>
        <button
          type="button"
          onClick={() => { navigate([]); onToggleL1(null, null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: '0.05em',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit',
          }}
        >
          <Home size={15} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
        {categories.map((cat) => {
          const isActive = activeL1 === cat.id;
          const isOpen = openCategoryId === cat.id;
          const highlighted = isActive || isOpen;
          const hasChildren = !!cat.children?.length;
          const deptColor = DEPT_COLORS[cat.id] || RED;

          return (
            <button
              key={cat.id}
              onClick={() => navigate([cat.id])}
              onMouseEnter={(e) => onToggleL1(cat.id, e.currentTarget)}
              type="button"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px 10px 16px',
                borderLeft: `3px solid ${highlighted ? deptColor : 'transparent'}`,
                background: highlighted ? `${deptColor}10` : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${highlighted ? deptColor : 'transparent'}`,
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
                transition: 'background 0.12s ease',
                height: '42px',
              }}
            >
              <span style={{
                fontSize: '13px', fontWeight: '700',
                color: highlighted ? deptColor : '#374151',
                flex: 1, lineHeight: 1.2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {cat.label}
                <Count value={lookupProductCount(counts, [cat.id], categories)} />
              </span>
              {hasChildren && (
                <span style={{ fontSize: '16px', lineHeight: 1, color: highlighted ? deptColor : '#D1D5DB', flexShrink: 0, fontWeight: '300' }}>
                  ›
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

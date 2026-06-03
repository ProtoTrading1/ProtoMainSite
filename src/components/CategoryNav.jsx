import { Home } from 'lucide-react';
import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';

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
          onClick={() => { navigate([]); onToggleL1(null); }}
          onMouseEnter={() => onToggleL1(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: '0.05em',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit',
          }}
        >
          <Home size={11} />
          Home
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
        {categories.map((cat) => {
          const isActive = activeL1 === cat.id;
          const isOpen = openCategoryId === cat.id;
          const highlighted = isActive || isOpen;
          const hasChildren = !!cat.children?.length;
          const deptColor = DEPT_COLORS[cat.id] || RED;
          const Icon = LUCIDE_ICON_MAP[cat.icon] || null;

          return (
            <button
              key={cat.id}
              onClick={() => navigate([cat.id])}
              onMouseEnter={() => onToggleL1(cat.id)}
              type="button"
              style={{
                display: 'flex', alignItems: 'center', gap: '11px',
                padding: '11px 14px 11px 13px',
                borderLeft: '3px solid transparent',
                borderLeftColor: highlighted ? deptColor : 'transparent',
                borderLeftStyle: 'solid',
                borderLeftWidth: '3px',
                background: highlighted ? `${deptColor}10` : 'transparent',
                border: 'none',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
                transition: 'background 0.12s ease',
                minHeight: '46px',
              }}
            >
              {Icon && (
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0,
                  background: highlighted ? `${deptColor}` : `${deptColor}18`,
                  color: highlighted ? '#fff' : deptColor,
                  transition: 'background 0.15s, color 0.15s',
                  boxShadow: highlighted ? `0 2px 8px ${deptColor}40` : 'none',
                }}>
                  <Icon size={15} />
                </span>
              )}
              <span style={{
                fontSize: '13.5px', fontWeight: highlighted ? '700' : '500',
                color: highlighted ? '#111827' : '#374151',
                flex: 1, lineHeight: 1.3,
              }}>
                {cat.label}
                <Count value={counts?.[cat.id]} />
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

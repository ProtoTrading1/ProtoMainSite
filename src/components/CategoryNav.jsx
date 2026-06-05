import { useState } from 'react';
import { Home } from 'lucide-react';
import { DEPT_COLORS } from '../lib/navConfig';

const RED = '#7F1D1D';

function Count({ value }) {
  if (value == null) return null;
  return (
    <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '600', marginLeft: '5px' }}>
      {value}
    </span>
  );
}

export default function CategoryNav({ categories, path, navigate, counts }) {
  const activeL1 = path?.[0] || null;
  const activeL2 = path?.[1] || null;
  const [openId, setOpenId] = useState(activeL1);

  const toggleL1 = (cat) => {
    const willOpen = openId !== cat.id;
    setOpenId(willOpen ? cat.id : null);
    navigate([cat.id]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px', borderBottom: '1px solid #F0F1F3',
      }}>
        <span style={{ fontSize: '11px', fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          All Categories
        </span>
        <button
          type="button"
          onClick={() => { navigate([]); setOpenId(null); }}
          style={{
            display: 'flex', alignItems: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            color: RED, padding: '2px 0', fontFamily: 'inherit',
          }}
        >
          <Home size={15} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
        {categories.map((cat) => {
          const isActive = activeL1 === cat.id;
          const isOpen = openId === cat.id;
          const highlighted = isActive || isOpen;
          const hasChildren = !!cat.children?.length;
          const deptColor = DEPT_COLORS[cat.id] || RED;

          return (
            <div key={cat.id}>
              {/* L1 row */}
              <button
                type="button"
                onClick={() => toggleL1(cat)}
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
                  fontSize: '13px', fontWeight: highlighted ? '700' : '500',
                  color: highlighted ? deptColor : '#374151',
                  flex: 1, lineHeight: 1.2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {cat.label}
                  <Count value={counts?.[cat.id]} />
                </span>
                {hasChildren && (
                  <span style={{
                    fontSize: '16px', lineHeight: 1, flexShrink: 0, fontWeight: '300',
                    color: highlighted ? deptColor : '#D1D5DB',
                    display: 'inline-block',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.18s ease',
                  }}>›</span>
                )}
              </button>

              {/* L2 children — inline accordion */}
              {isOpen && hasChildren && (
                <div style={{ borderLeft: `3px solid ${deptColor}40`, marginLeft: 0 }}>
                  {cat.children.map((l2) => {
                    const l2Active = activeL2 === l2.id;
                    return (
                      <button
                        key={l2.id}
                        type="button"
                        onClick={() => navigate([cat.id, l2.id])}
                        style={{
                          display: 'flex', alignItems: 'center',
                          padding: '7px 14px 7px 28px',
                          background: l2Active ? `${deptColor}12` : 'transparent',
                          border: 'none',
                          borderLeft: l2Active ? `2px solid ${deptColor}` : '2px solid transparent',
                          cursor: 'pointer', textAlign: 'left',
                          fontFamily: 'inherit', width: '100%',
                          transition: 'background 0.1s ease',
                          height: '34px',
                        }}
                      >
                        <span style={{
                          fontSize: '12.5px',
                          fontWeight: l2Active ? '700' : '500',
                          color: l2Active ? deptColor : '#4b5563',
                          flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {l2.label}
                          <Count value={counts?.[l2.id]} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

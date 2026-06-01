import { useState } from 'react';

const RED = '#DC2626';

function Count({ value }) {
  if (value == null) return null;
  return (
    <sup style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '600', marginLeft: '3px', top: '-0.4em', position: 'relative' }}>
      {value}
    </sup>
  );
}

function PanelHeader({ label, onViewAll }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px 12px', borderBottom: '1px solid #F0F1F3', flexShrink: 0,
      }}
    >
      <span style={{ fontSize: '12px', fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <button
        type="button"
        onClick={onViewAll}
        style={{
          fontSize: '10px', fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: '0.05em',
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit', flexShrink: 0, marginLeft: '10px',
        }}
      >
        View All
      </button>
    </div>
  );
}

function ListItem({ label, count, hasArrow, active, onClick, onMouseEnter }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 18px 9px 15px', width: '100%',
        borderLeftWidth: '3px', borderLeftStyle: 'solid',
        borderLeftColor: active ? RED : 'transparent',
        borderTop: 'none', borderRight: 'none', borderBottom: 'none',
        background: active ? '#fff5f7' : 'transparent',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        transition: 'background 0.12s ease',
      }}
    >
      <span style={{
        fontSize: '13px', fontWeight: active ? '700' : '500',
        color: active ? '#111827' : '#374151',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
        <Count value={count} />
      </span>
      {hasArrow && (
        <span style={{ fontSize: '15px', lineHeight: 1, color: active ? RED : '#C7CBD1', flexShrink: 0, marginLeft: '8px' }}>
          &rsaquo;
        </span>
      )}
    </button>
  );
}

export default function MegaMenu({ l1Node, navigate, counts, onClose }) {
  const [hoveredL2Id, setHoveredL2Id] = useState(null);

  if (!l1Node) return null;

  const l2List = l1Node.children || [];
  const hoveredL2 = l2List.find((c) => c.id === hoveredL2Id) || null;
  const l3List = hoveredL2?.children || [];

  const countFor = (...segments) => counts?.[segments.join('/')] ?? null;
  const go = (segments) => {
    navigate(segments);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: '100%',
        top: 0,
        height: '100%',
        display: 'flex',
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        borderRight: '1px solid #e5e7eb',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '12px 0 30px rgba(15, 23, 42, 0.08)',
        zIndex: 300,
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {/* Column 2 — L2 */}
      <div style={{ width: 280, display: 'flex', flexDirection: 'column', borderRight: '1px solid #F0F1F3', minWidth: 0 }}>
        <PanelHeader label={l1Node.label} onViewAll={() => go([l1Node.id])} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {l2List.map((l2) => {
            const hasChildren = !!l2.children?.length;
            return (
              <ListItem
                key={l2.id}
                label={l2.label}
                count={countFor(l1Node.id, l2.id)}
                hasArrow={hasChildren}
                active={hoveredL2Id === l2.id}
                onClick={() => go([l1Node.id, l2.id])}
                onMouseEnter={() => setHoveredL2Id(l2.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Column 3 — L3 */}
      <div style={{ width: 280, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {hoveredL2 && l3List.length > 0 ? (
          <>
            <PanelHeader label={hoveredL2.label} onViewAll={() => go([l1Node.id, hoveredL2.id])} />
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {l3List.map((l3) => (
                <ListItem
                  key={l3.id}
                  label={l3.label}
                  count={countFor(l1Node.id, hoveredL2.id, l3.id)}
                  hasArrow={false}
                  active={false}
                  onClick={() => go([l1Node.id, hoveredL2.id, l3.id])}
                  onMouseEnter={undefined}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500', lineHeight: 1.5 }}>
              Hover a category to explore
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

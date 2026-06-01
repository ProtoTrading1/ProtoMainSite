import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';
import { DEPT_THEME_CARDS } from '../lib/themeCards';

// Compact theme card for the flyout 3rd column
function FlyoutThemeCard({ card, color, onClick }) {
  const badge = card.badge;
  const BADGE_COLORS = {
    'Best Seller': { bg: '#FEF3C7', color: '#92400E' },
    'Popular':     { bg: '#DBEAFE', color: '#1E40AF' },
    'Hot':         { bg: '#FEE2E2', color: '#991B1B' },
    'Seasonal':    { bg: '#D1FAE5', color: '#065F46' },
  };
  const badgeStyle = badge ? BADGE_COLORS[badge] : null;

  function darken(hex, r = 0.2) {
    const n = parseInt(hex.replace('#',''), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * (1 - r))));
    const rd = c(n >> 16); const g = c((n >> 8) & 0xff); const b = c(n & 0xff);
    return `#${((rd << 16)|(g << 8)|b).toString(16).padStart(6,'0')}`;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flyout-theme-card"
      style={{ background: `linear-gradient(135deg, ${color} 0%, ${darken(color)} 100%)` }}
    >
      <div className="flyout-theme-card-top">
        <span className="flyout-theme-card-title">{card.title}</span>
        {badgeStyle && (
          <span className="flyout-theme-card-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
            {badge}
          </span>
        )}
      </div>
      <p className="flyout-theme-card-sub">{card.subtitle}</p>
      <div className="flyout-theme-card-cta">
        <span>Shop</span><ArrowRight size={11} />
      </div>
    </button>
  );
}

function Count({ value }) {
  if (value == null) return null;
  return (
    <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '600', marginLeft: '5px', verticalAlign: '0.25em' }}>
      {value}
    </span>
  );
}

function PanelHeader({ label, onViewAll, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 20px 11px', borderBottom: '1px solid #F0F1F3', flexShrink: 0,
    }}>
      <span style={{ fontSize: '12px', fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <button
        type="button"
        onClick={onViewAll}
        style={{
          fontSize: '10px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.05em',
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
          fontFamily: 'inherit', flexShrink: 0, marginLeft: '10px',
        }}
      >
        View All
      </button>
    </div>
  );
}

function ListItem({ label, count, hasArrow, active, onClick, onMouseEnter, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px 10px 16px', width: '100%',
        borderLeftWidth: '3px', borderLeftStyle: 'solid',
        borderLeftColor: active ? color : 'transparent',
        borderTop: 'none', borderRight: 'none', borderBottom: 'none',
        background: active ? `${color}0d` : 'transparent',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        transition: 'background 0.1s ease, border-color 0.1s ease',
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
        <span style={{ fontSize: '15px', lineHeight: 1, color: active ? color : '#C7CBD1', flexShrink: 0, marginLeft: '8px' }}>
          &rsaquo;
        </span>
      )}
    </button>
  );
}

export default function MegaMenu({ l1Node, navigate, counts, onClose }) {
  const l2List = l1Node?.children || [];
  const [hoveredL2Id, setHoveredL2Id] = useState(l2List[0]?.id || null);
  const leaveTimerRef = useRef(null);

  if (!l1Node) return null;

  const color = DEPT_COLORS[l1Node.id] || '#DC2626';
  const Icon = LUCIDE_ICON_MAP[l1Node.icon] || null;
  const themeCards = (DEPT_THEME_CARDS[l1Node.id] || []).slice(0, 4);

  const hoveredL2 = l2List.find((c) => c.id === hoveredL2Id) || l2List[0] || null;
  const l3List = hoveredL2?.children || [];

  const countFor = (...segments) => counts?.[segments.join('/')] ?? null;
  const go = (segments) => { navigate(segments); onClose(); };

  // Delay closing L2 hover state so diagonal mouse movement to L3 doesn't flicker
  const handleL2Enter = (id) => {
    if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    setHoveredL2Id(id);
  };
  const handleL2Leave = () => {
    leaveTimerRef.current = setTimeout(() => {
      // revert to first item rather than null so panel never goes empty
      setHoveredL2Id(l2List[0]?.id || null);
    }, 200);
  };

  return (
    <div
      className="mega-menu-flyout"
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
        boxShadow: '16px 0 40px rgba(15, 23, 42, 0.1)',
        zIndex: 300,
        fontFamily: 'Outfit, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Column 2 — L2 categories */}
      <div
        style={{ width: 280, display: 'flex', flexDirection: 'column', borderRight: '1px solid #F0F1F3', minWidth: 0 }}
        onMouseLeave={handleL2Leave}
      >
        {/* Dept accent header */}
        <div style={{
          padding: '13px 20px',
          borderBottom: `3px solid ${color}`,
          background: `${color}0a`,
          display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0,
        }}>
          {Icon && (
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '7px',
              background: `${color}22`, color, flexShrink: 0,
            }}>
              <Icon size={14} />
            </span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l1Node.label}
            </div>
            {counts?.[l1Node.id] != null && (
              <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '500' }}>
                {counts[l1Node.id].toLocaleString()} products
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => go([l1Node.id])}
            style={{
              fontSize: '10px', fontWeight: '700', color, textTransform: 'uppercase',
              letterSpacing: '0.05em', background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 0', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            View All
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {l2List.map((l2) => (
            <ListItem
              key={l2.id}
              label={l2.label}
              count={countFor(l1Node.id, l2.id)}
              hasArrow={!!l2.children?.length}
              active={hoveredL2Id === l2.id || (!hoveredL2Id && l2.id === l2List[0]?.id)}
              color={color}
              onClick={() => go([l1Node.id, l2.id])}
              onMouseEnter={() => handleL2Enter(l2.id)}
            />
          ))}
        </div>
      </div>

      {/* Column 3 — L3 subcategories */}
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {hoveredL2 && l3List.length > 0 && (
          <>
            <PanelHeader label={hoveredL2.label} onViewAll={() => go([l1Node.id, hoveredL2.id])} color={color} />
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {l3List.map((l3) => (
                <ListItem
                  key={l3.id}
                  label={l3.label}
                  count={countFor(l1Node.id, hoveredL2.id, l3.id)}
                  hasArrow={false}
                  active={false}
                  color={color}
                  onClick={() => go([l1Node.id, hoveredL2.id, l3.id])}
                  onMouseEnter={undefined}
                />
              ))}
            </div>
          </>
        )}
        {hoveredL2 && l3List.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px' }}>
            <p style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.6 }}>
              Browse all products in <strong style={{ color: '#111827' }}>{hoveredL2.label}</strong>
            </p>
            <button
              type="button"
              onClick={() => go([l1Node.id, hoveredL2.id])}
              style={{
                padding: '9px 16px', borderRadius: '8px', background: color, color: '#fff',
                border: 'none', fontWeight: '700', fontSize: '12px', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', alignSelf: 'flex-start',
                transition: 'opacity 0.15s',
              }}
            >
              View all →
            </button>
          </div>
        )}
      </div>

      {/* Column 4 — Theme cards (visual merchandising) */}
      {themeCards.length > 0 && (
        <div style={{
          width: 260, display: 'flex', flexDirection: 'column', minWidth: 0,
          borderLeft: '1px solid #F0F1F3', background: '#FAFAFA',
        }}>
          <div style={{
            padding: '13px 16px 10px',
            borderBottom: '1px solid #F0F1F3',
            fontSize: '10px', fontWeight: '800', color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
          }}>
            Shop by use case
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {themeCards.map((card) => (
              <FlyoutThemeCard
                key={card.id}
                card={card}
                color={color}
                onClick={() => { if (card.path) go(card.path); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

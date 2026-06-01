import { ArrowRight } from 'lucide-react';
import { LUCIDE_ICON_MAP } from '../lib/navConfig';

const BADGE_STYLES = {
  'Best Seller': { bg: '#FEF3C7', color: '#92400E' },
  'Popular':     { bg: '#DBEAFE', color: '#1E40AF' },
  'Hot':         { bg: '#FEE2E2', color: '#991B1B' },
  'Seasonal':    { bg: '#D1FAE5', color: '#065F46' },
};

// Darkens a hex colour by a ratio (0–1)
function darken(hex, ratio = 0.18) {
  const n = parseInt(hex.replace('#', ''), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(Math.round((n >> 16) * (1 - ratio)));
  const g = clamp(Math.round(((n >> 8) & 0xff) * (1 - ratio)));
  const b = clamp(Math.round((n & 0xff) * (1 - ratio)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function ThemeCard({ card, color, iconName, navigate }) {
  const Icon = iconName ? LUCIDE_ICON_MAP[iconName] : null;
  const badge = card.badge ? BADGE_STYLES[card.badge] : null;
  const bg = `linear-gradient(135deg, ${color} 0%, ${darken(color, 0.22)} 100%)`;

  const handleClick = () => {
    if (card.path) navigate(card.path);
  };

  return (
    <button
      type="button"
      className="theme-card"
      onClick={handleClick}
      style={{ background: bg }}
      aria-label={card.title}
    >
      {/* Badge */}
      {badge && (
        <span
          className="theme-card-badge"
          style={{ background: badge.bg, color: badge.color }}
        >
          {card.badge}
        </span>
      )}

      {/* Background icon (decorative) */}
      {Icon && (
        <span className="theme-card-bg-icon">
          <Icon size={72} strokeWidth={1.2} />
        </span>
      )}

      {/* Text content */}
      <div className="theme-card-content">
        <h3 className="theme-card-title">{card.title}</h3>
        <p className="theme-card-subtitle">{card.subtitle}</p>
      </div>

      {/* CTA */}
      <div className="theme-card-cta">
        <span>Browse</span>
        <ArrowRight size={13} />
      </div>
    </button>
  );
}

export default function ThemeCardGrid({ cards, color, iconName, navigate }) {
  if (!cards?.length) return null;
  return (
    <div className="theme-card-grid">
      {cards.map((card) => (
        <ThemeCard
          key={card.id}
          card={card}
          color={color}
          iconName={iconName}
          navigate={navigate}
        />
      ))}
    </div>
  );
}

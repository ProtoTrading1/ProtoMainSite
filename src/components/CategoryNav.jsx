import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';
import { filterNavChildrenByCount, lookupProductCount } from '../lib/taxonomy';
import categories from '../data/categories.json';

const RED = '#7F1D1D';

const ICON_MAP = Object.fromEntries(
  categories.map((c) => [c.id, LUCIDE_ICON_MAP[c.icon] || null])
);

function focusSiblingCategoryButton(currentButton, direction) {
  const list = currentButton?.closest('.cat-nav-list');
  if (!list) return;
  const buttons = Array.from(list.querySelectorAll('.cat-nav-btn'));
  const currentIndex = buttons.indexOf(currentButton);
  if (currentIndex < 0 || buttons.length === 0) return;
  const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
  buttons[nextIndex]?.focus();
}

export default function CategoryNav({
  categories: cats,
  path,
  navigate,
  onAllProducts,
  onToggleL1,
  onOpenFlyoutWithKeyboard = () => {},
  openCategoryId,
  counts,
}) {
  const activeL1 = path?.[0] || null;

  // Counts start as the placeholder { '': 0 } before the first real fetch —
  // that's the ONLY not-ready shape. Anything else (real per-category counts,
  // or the API-fallback shape { '': N }) counts as loaded, so the skeleton
  // never sticks during an outage. Until ready we show a skeleton instead of an
  // empty (all-filtered-out) list.
  const countsReady = Boolean(counts) && !(
    Object.keys(counts).length === 1 && Number(counts['']) === 0
  );
  const skeletonRows = Math.min(Math.max((cats?.length || 11), 8), 14);

  return (
    <div className="cat-nav">
      <div className="cat-nav-header">
        <span className="cat-nav-header-label">Departments</span>
        <button
          type="button"
          className="cat-nav-all-products-btn"
          onClick={() => { onAllProducts(); onToggleL1(null, null); }}
        >
          All Products
        </button>
      </div>

      {!countsReady ? (
        <ul className="cat-nav-list cat-nav-list--loading" role="list" aria-hidden="true">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <li key={i} className="cat-nav-item cat-nav-skeleton">
              <span className="cat-nav-skeleton-icon" />
              <span className="cat-nav-skeleton-bar" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
            </li>
          ))}
        </ul>
      ) : (
      <ul className="cat-nav-list" role="list">
        {cats.filter((cat) => (lookupProductCount(counts, [cat.id], cats) || 0) > 0
          // Never hide the department the user is currently viewing, even if a
          // background count poll briefly drops it to zero.
          || cat.id === activeL1).map((cat) => {
          const isActive = activeL1 === cat.id;
          const isOpen = openCategoryId === cat.id;
          const highlighted = isActive || isOpen;
          const visibleChildren = filterNavChildrenByCount(cat.children, [cat.id], counts, cats);
          const hasChildren = visibleChildren.length > 0;
          const color = DEPT_COLORS[cat.id] || RED;
          // Prefer the live node's icon (new/renamed categories), fall back to
          // the bundled id map so existing departments keep their icons.
          const Icon = LUCIDE_ICON_MAP[cat.icon] || ICON_MAP[cat.id] || null;
          const count = lookupProductCount(counts, [cat.id], cats);

          return (
            <li key={cat.id} className={`cat-nav-item${highlighted ? ' cat-nav-item--active' : ''}`}
              style={highlighted ? { '--cat-color': color } : undefined}
            >
              <button
                type="button"
                className="cat-nav-btn"
                onClick={() => navigate([cat.id])}
                onMouseEnter={(e) => onToggleL1(cat.id, e.currentTarget)}
                onFocus={(e) => onToggleL1(cat.id, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    focusSiblingCategoryButton(e.currentTarget, 1);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    focusSiblingCategoryButton(e.currentTarget, -1);
                    return;
                  }
                  if (e.key === 'ArrowRight' && hasChildren) {
                    e.preventDefault();
                    onToggleL1(cat.id, e.currentTarget);
                    onOpenFlyoutWithKeyboard();
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-haspopup={hasChildren ? 'menu' : undefined}
                aria-expanded={hasChildren ? isOpen : undefined}
              >
                {Icon && (
                  <span className="cat-nav-icon" style={highlighted ? { color } : undefined}>
                    <Icon size={15} strokeWidth={2} />
                  </span>
                )}
                <span className="cat-nav-label">{cat.label}</span>
                <span className="cat-nav-right">
                  {count != null && <span className="cat-nav-count">{count}</span>}
                  {hasChildren && <span className="cat-nav-chevron" style={highlighted ? { color } : undefined}>›</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';
import { filterNavChildrenByCount, lookupProductCount } from '../lib/taxonomy';
import categories from '../data/categories.json';

const RED = '#7F1D1D';

const ICON_MAP = Object.fromEntries(
  categories.map((c) => [c.id, LUCIDE_ICON_MAP[c.icon] || null])
);

export default function CategoryNav({ categories: cats, path, navigate, onAllProducts, onToggleL1, openCategoryId, counts }) {
  const activeL1 = path?.[0] || null;

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

      <ul className="cat-nav-list" role="list">
        {cats.map((cat) => {
          const isActive = activeL1 === cat.id;
          const isOpen = openCategoryId === cat.id;
          const highlighted = isActive || isOpen;
          const visibleChildren = filterNavChildrenByCount(cat.children, [cat.id], counts, cats);
          const hasChildren = visibleChildren.length > 0;
          const color = DEPT_COLORS[cat.id] || RED;
          const Icon = ICON_MAP[cat.id] || null;
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
    </div>
  );
}

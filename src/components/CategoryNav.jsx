const RED = '#DC2626';

function Count({ value }) {
  if (value == null) return null;
  return (
    <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '600', marginLeft: '4px', verticalAlign: '0.25em' }}>
      {value}
    </span>
  );
}

export default function CategoryNav({ categories, path, navigate, onToggleL1, openCategoryId, counts }) {
  const activeL1 = path?.[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif' }}>
      {/* Header row: ALL CATEGORIES + VIEW ALL */}
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
            fontSize: '10px', fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: '0.05em',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit',
          }}
        >
          View All
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 0' }}>
        {categories.map((cat) => {
          const isActive = activeL1 === cat.id;
          const isOpen = openCategoryId === cat.id;
          const highlighted = isActive || isOpen;
          const hasChildren = !!cat.children?.length;

          return (
            <button
              key={cat.id}
              onClick={() => navigate([cat.id])}
              onMouseEnter={() => onToggleL1(cat.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 16px 9px 13px',
                borderLeft: highlighted ? `3px solid ${RED}` : '3px solid transparent',
                background: highlighted ? '#fff5f7' : 'transparent',
                border: 'none', borderLeftWidth: '3px', borderLeftStyle: 'solid',
                borderLeftColor: highlighted ? RED : 'transparent',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
                transition: 'background 0.12s ease',
              }}
            >
              <span style={{
                fontSize: '13px', fontWeight: highlighted ? '700' : '500',
                color: highlighted ? '#111827' : '#374151',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {cat.label}
                <Count value={counts?.[cat.id]} />
              </span>
              {hasChildren && (
                <span style={{ fontSize: '15px', lineHeight: 1, color: highlighted ? RED : '#C7CBD1', flexShrink: 0, marginLeft: '8px' }}>
                  &rsaquo;
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react';
import * as Icons from 'lucide-react';

const ICON_MAP = {
  Briefcase: Icons.Briefcase, Scissors: Icons.Scissors,
  ToyBrick: Icons.Gamepad2, PenTool: Icons.PenTool,
  Home: Icons.Home, Smile: Icons.Smile,
  Shirt: Icons.Shirt, Cookie: Icons.Cookie,
  Wind: Icons.Wind, Utensils: Icons.Utensils,
  Gift: Icons.Gift, Package: Icons.Package,
  Wrench: Icons.Wrench, Snowflake: Icons.Snowflake,
  Tags: Icons.Tags,
};

export default function CategoryNav({ categories, path, navigate, onToggleL1, openCategoryId, counts }) {
  const activeL1 = path?.[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 0' }}>
      <button
        onClick={() => { navigate([]); onToggleL1(null); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 12px', margin: '0 8px 10px', borderRadius: '10px',
          border: '1px solid #e5e7eb', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          backgroundColor: !activeL1 ? '#111827' : '#ffffff',
          color: !activeL1 ? '#fff' : '#111827',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LayoutGrid size={16} color={!activeL1 ? '#fff' : '#9CA3AF'} />
          <span style={{ fontSize: '13px', fontWeight: '800' }}>All Products</span>
        </div>
        <span style={{ fontSize: '11px', color: !activeL1 ? 'rgba(255,255,255,0.72)' : '#9CA3AF', fontWeight: '700' }}>
          {counts?.[''] ?? '0'}
        </span>
      </button>

      {categories.map((cat) => {
        const Icon = ICON_MAP[cat.icon] || Icons.FolderOpen;
        const isActive = activeL1 === cat.id;
        const isOpen = openCategoryId === cat.id;
        const hasChildren = !!cat.children?.length;

        return (
          <button
            key={cat.id}
            onClick={() => {
              if (!hasChildren) {
                navigate([cat.id]);
                onToggleL1(null);
                return;
              }
              onToggleL1(isOpen ? null : cat.id);
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 12px', margin: '0 8px 4px', borderRadius: '9px',
              border: isOpen ? '1px solid #fecdd3' : '1px solid transparent',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              backgroundColor: isActive || isOpen ? '#fff5f7' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <Icon size={16} color={isActive || isOpen ? '#DC2626' : '#9CA3AF'} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: '13px', fontWeight: isActive || isOpen ? '700' : '600',
                color: isActive || isOpen ? '#111827' : '#374151',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {cat.label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {counts?.[cat.id] != null && (
                <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '700' }}>{counts[cat.id]}</span>
              )}
              {hasChildren ? (isOpen ? <ChevronDown size={15} color="#DC2626" /> : <ChevronRight size={15} color="#D1D5DB" />) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

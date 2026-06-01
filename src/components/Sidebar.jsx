import { useMemo, useState } from 'react';
import CategoryNav from './CategoryNav';
import MegaMenu from './MegaMenu';

export default function Sidebar({ categories, path, navigate, counts }) {
  const [openCategoryId, setOpenCategoryId] = useState(path?.[0] || null);

  const activeRoot = path?.[0] || null;

  const menuNode = useMemo(() => {
    const targetId = openCategoryId || activeRoot;
    return targetId ? categories.find((category) => category.id === targetId) : null;
  }, [activeRoot, categories, openCategoryId]);

  const menuOpen = Boolean(menuNode?.children?.length && openCategoryId);

  return (
    <div
      className="sidebar-container"
      onMouseLeave={() => setOpenCategoryId(null)}
      style={{
        position: 'relative',
        height: '100%',
        backgroundColor: '#fff',
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative',
          zIndex: 210,
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>
          <CategoryNav
            categories={categories}
            path={path}
            navigate={navigate}
            counts={counts}
            openCategoryId={openCategoryId}
            onToggleL1={setOpenCategoryId}
          />
        </div>
      </div>

      {menuOpen && menuNode && (
        <MegaMenu
          key={menuNode.id}
          l1Node={menuNode}
          navigate={navigate}
          counts={counts}
          onClose={() => setOpenCategoryId(null)}
        />
      )}
    </div>
  );
}

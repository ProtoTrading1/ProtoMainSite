import { X, ChevronLeft, ChevronRight, LayoutGrid, User, LogOut, LayoutDashboard } from 'lucide-react';

export default function MobileNav({ isOpen, onClose, categories, path, navigate, counts, breadcrumb, customer, onViewProfile, onViewAdmin, onLogout }) {
  if (!isOpen) return null;

  let currentCategories = categories;
  if (path && path.length > 0) {
    let node = categories;
    for (const segmentId of path) {
      const found = node.find((n) => n.id === segmentId);
      if (found && found.children) node = found.children;
      else {
        node = [];
        break;
      }
    }
    currentCategories = node;
  }

  const currentLabel = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].label : 'All Categories';

  const handleSelect = (id) => {
    navigate([...path, id]);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'flex-start',
      }}
    >
      <div
        style={{
          width: '85%',
          maxWidth: '320px',
          height: '100%',
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '4px 0 20px rgba(0,0,0,0.2)',
          animation: 'slideIn 0.3s ease-out',
        }}
      >
        <div
          style={{
            padding: '20px 16px',
            borderBottom: '1px solid #E2E4E9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#000000',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {path.length > 0 ? (
              <button onClick={() => navigate(path.slice(0, -1))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
                <ChevronLeft size={24} />
              </button>
            ) : (
              <LayoutGrid size={22} color="#DC2626" />
            )}
            <span style={{ fontSize: '18px', fontWeight: '800' }}>{currentLabel}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {path.length > 0 && (
            <button
              onClick={() => {
                navigate(path);
                onClose();
              }}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: 'none',
                background: '#FFF7F7',
                borderBottom: '1px solid #FEF2F2',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LayoutGrid size={16} color="#DC2626" />
                <span style={{ fontSize: '14px', fontWeight: '800', color: '#DC2626' }}>View all {currentLabel}</span>
              </div>
            </button>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button
              onClick={() => {
                navigate([]);
                onClose();
              }}
              style={{
                width: '100%',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: 'none',
                background: path.length === 0 ? '#fff5f7' : 'none',
                borderBottom: '1px solid #F3F4F6',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>All Products</span>
              {counts?.[''] != null && <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600' }}>({counts['']})</span>}
            </button>

            {currentCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleSelect(cat.id)}
                style={{
                  width: '100%',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: 'none',
                  background: 'none',
                  borderBottom: '1px solid #F3F4F6',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{cat.label}</span>
                  {counts?.[[...path, cat.id].join('/')] != null && (
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600' }}>
                      ({counts[[...path, cat.id].join('/')]})
                    </span>
                  )}
                </div>
                {cat.children && cat.children.length > 0 && <ChevronRight size={18} color="#D1D5DB" />}
              </button>
            ))}
          </div>

          {currentCategories.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '20px' }}>You&apos;re inside {currentLabel}</div>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  backgroundColor: '#DC2626',
                  color: '#fff',
                  border: 'none',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Show products
              </button>
            </div>
          )}
        </div>

        {/* Account actions at bottom */}
        <div style={{ borderTop: '1px solid #E5E7EB', padding: '12px 0', flexShrink: 0 }}>
          {onViewProfile && (
            <button
              onClick={() => { onViewProfile(); onClose(); }}
              style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
            >
              <User size={18} color="#374151" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>My Profile</div>
                {customer?.name && <div style={{ fontSize: '12px', color: '#6B7280' }}>{customer.name}</div>}
              </div>
            </button>
          )}
          {customer?.role === 'admin' && onViewAdmin && (
            <button
              onClick={() => { onViewAdmin(); onClose(); }}
              style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
            >
              <LayoutDashboard size={18} color="#374151" />
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>Admin Dashboard</span>
            </button>
          )}
          {onLogout && (
            <button
              onClick={() => { onLogout(); onClose(); }}
              style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
            >
              <LogOut size={18} color="#DC2626" />
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#DC2626' }}>Log Out</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }} onClick={onClose} />

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

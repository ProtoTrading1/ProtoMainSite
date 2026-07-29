import { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, LayoutGrid, Loader2, MessageCircle, PackageSearch, Search, Upload, User, LogOut, LayoutDashboard } from 'lucide-react';
import { DEPT_COLORS, LUCIDE_ICON_MAP } from '../lib/navConfig';
import { filterNavChildrenWhenCountsReady, lookupProductCount } from '../lib/taxonomy';
import { openIntercom } from '../lib/intercom';
import { authHeaders } from '../lib/authHeaders';

function MobileProductRequest({ onClose: closeAll }) {
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('');
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { setError('Select an image file.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setImage({ base64: ev.target.result.split(',')[1], name: file.name, type: file.type, preview: ev.target.result }); setError(''); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Please describe the product.'); return; }
    if (!image) { setError('Please attach a reference image.'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/product-request', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ description: description.trim(), qty: qty.trim() || null, imageBase64: image.base64, imageName: image.name, imageType: image.type }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed.');
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  if (done) return (
    <div style={{ padding: '24px 20px', textAlign: 'center' }}>
      <PackageSearch size={36} style={{ color: '#8B1A1A', margin: '0 auto 12px', display: 'block' }} />
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Request sent!</div>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>Our team will get back to you shortly.</p>
      <button onClick={closeAll} style={{ padding: '10px 24px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
    </div>
  );

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Can't find what you're looking for?</div>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>Describe it and attach a reference image.</p>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the product…" rows={3} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
      <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantity (optional)" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <div onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        style={{ border: `2px dashed ${image ? '#d1d5db' : '#cbd5e1'}`, borderRadius: 8, minHeight: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 10, gap: 6, padding: image ? 0 : 12 }}>
        {image ? <><img src={image.preview} alt="" style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain', padding: 8 }} /><div style={{ fontSize: 11, color: '#6b7280', paddingBottom: 6 }}>Tap to change</div></> : <><Upload size={20} style={{ color: '#9ca3af' }} /><div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Tap to add reference image *</div></>}
      </div>
      {error && <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#7f1d1d', fontSize: 13 }}>{error}</div>}
      <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: 12, background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {submitting ? <><Loader2 size={15} className="spin-icon" /> Sending…</> : <><PackageSearch size={15} /> Send Request</>}
      </button>
    </div>
  );
}

export default function MobileNav({ isOpen, onClose, categories, path, navigate, counts, breadcrumb, customer, onViewProfile, onViewAdmin, onLogout }) {
  const [showProductRequest, setShowProductRequest] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onDialogKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', onDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) setCategoryQuery('');
  }, [isOpen]);

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

  // Hide empty categories at every level — including empty top-level
  // departments at the root — so mobile matches the desktop rail.
  currentCategories = filterNavChildrenWhenCountsReady(currentCategories, path || [], counts, categories);

  const currentLabel = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].label : 'All Categories';
  const normalizedQuery = categoryQuery.trim().toLocaleLowerCase();
  const collectMatches = (nodes, parentPath = [], matches = []) => {
    for (const node of nodes || []) {
      const nodePath = [...parentPath, node.id];
      if (lookupProductCount(counts, nodePath, categories) === 0) continue;
      if (node.label.toLocaleLowerCase().includes(normalizedQuery)) matches.push({ ...node, navPath: nodePath });
      collectMatches(node.children, nodePath, matches);
    }
    return matches;
  };
  const searchMatches = normalizedQuery ? collectMatches(categories).slice(0, 40) : null;
  const visibleCategories = searchMatches || currentCategories.map((cat) => ({ ...cat, navPath: [...path, cat.id] }));

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Browse categories"
        style={{
          width: '85%',
          maxWidth: '320px',
          height: '100dvh',
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
              <button onClick={() => navigate(path.slice(0, -1))} aria-label="Back one category level" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}>
                <ChevronLeft size={24} />
              </button>
            ) : (
              <LayoutGrid size={22} color="#DC2626" />
            )}
            <span style={{ fontSize: '18px', fontWeight: '800' }}>{currentLabel}</span>
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Close categories" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <div style={{ padding: '4px 12px 10px' }}>
            <label htmlFor="mobile-category-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search categories</label>
            <div style={{ position: 'relative' }}>
              <Search size={17} aria-hidden="true" style={{ position: 'absolute', left: 13, top: 14, color: '#6B7280' }} />
              <input
                id="mobile-category-search"
                type="search"
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="Search categories"
                style={{ width: '100%', minHeight: 44, padding: '10px 36px 10px 40px', border: '1px solid #D1D5DB', borderRadius: 9, fontFamily: 'inherit', fontSize: 15, boxSizing: 'border-box' }}
              />
              {categoryQuery && <button onClick={() => setCategoryQuery('')} aria-label="Clear category search" style={{ position: 'absolute', right: 2, top: 1, width: 42, height: 42, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: '#6B7280' }}><X size={16} /></button>}
            </div>
          </div>
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
                <span style={{ fontSize: '14px', fontWeight: '800', color: '#7F1D1D' }}>View all {currentLabel}</span>
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

            {visibleCategories.map((cat) => {
              const deptColor = DEPT_COLORS[cat.id] || '#374151';
              const Icon = cat.icon ? LUCIDE_ICON_MAP[cat.icon] : null;
              const isTopLevel = cat.navPath.length === 1;
              const count = lookupProductCount(counts, cat.navPath, categories);
              return (
                <div
                  key={cat.navPath.join('/')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    background: 'none',
                    borderBottom: '1px solid #F3F4F6',
                  }}
                >
                  <button
                    onClick={() => { navigate(cat.navPath); onClose(); }}
                    style={{ minHeight: 52, padding: '8px 8px 8px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                  >
                    {isTopLevel && Icon && (
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0,
                        background: `${deptColor}18`, color: deptColor,
                      }}>
                        <Icon size={14} />
                      </span>
                    )}
                    <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
                    {count != null && (
                      <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600', flexShrink: 0 }}>
                        {count}
                      </span>
                    )}
                  </button>
                  {cat.children && cat.children.length > 0 && (
                    <button
                      onClick={() => { setCategoryQuery(''); navigate(cat.navPath); }}
                      aria-label={`Browse subcategories in ${cat.label}`}
                      style={{ width: 52, minWidth: 52, height: 52, display: 'grid', placeItems: 'center', border: 0, borderLeft: '1px solid #F3F4F6', background: 'transparent', cursor: 'pointer' }}
                    >
                      <ChevronRight size={19} color="#6B7280" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {visibleCategories.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '20px' }}>{normalizedQuery ? 'No matching categories.' : `You're inside ${currentLabel}`}</div>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  backgroundColor: '#7F1D1D',
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

        {/* Can't find / Chat CTAs */}
        {!showProductRequest && (
          <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => setShowProductRequest(true)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 10px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#374151', cursor: 'pointer' }}
            >
              <PackageSearch size={15} style={{ color: '#8B1A1A' }} /> Can't find it?
            </button>
            <button
              onClick={() => { onClose(); openIntercom(); }}
              aria-label="Ask Proto — online"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 10px', border: '1px solid rgba(212,173,86,0.6)', borderRadius: 10, background: '#101010', boxShadow: '0 5px 14px rgba(0,0,0,0.14)', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, color: '#fff', cursor: 'pointer' }}
            >
              <MessageCircle size={15} style={{ color: '#D4AD56' }} />
              Ask Proto
              <span aria-hidden="true" style={{ width: 6, height: 6, marginLeft: 2, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 3px rgba(34,197,94,0.14)' }} />
            </button>
          </div>
        )}

        {/* Product request inline form */}
        {showProductRequest && (
          <div style={{ borderTop: '1px solid #f1f5f9', flexShrink: 0, overflowY: 'auto', maxHeight: '60vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 0' }}>
              <button onClick={() => setShowProductRequest(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>
                <ChevronLeft size={16} /> Back
              </button>
            </div>
            <MobileProductRequest onClose={() => { setShowProductRequest(false); onClose(); }} />
          </div>
        )}

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
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#7F1D1D' }}>Log Out</span>
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

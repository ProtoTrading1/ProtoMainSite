import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, PackageSearch, Upload, X } from 'lucide-react';
import CategoryNav from './CategoryNav';
import { openIntercom } from '../lib/intercom';
import { authHeaders } from '../lib/authHeaders';
let megaMenuPreloadPromise = null;

export function preloadMegaMenu() {
  if (!megaMenuPreloadPromise) {
    megaMenuPreloadPromise = import('./MegaMenu');
  }
  return megaMenuPreloadPromise;
}

preloadMegaMenu();

const LazyMegaMenu = lazy(() => preloadMegaMenu());
import { filterNavChildrenByCount } from '../lib/taxonomy';

// A short intent window prevents accidental flyouts while moving the pointer
// through the rail, without making a deliberate category hover feel sluggish.
const MENU_HOVER_INTENT_MS = 100;

function ProductRequestModal({ onClose }) {
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('');
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onGlobalEscape = (event) => {
      if (event.key !== 'Escape') return;
      onClose?.();
    };
    document.addEventListener('keydown', onGlobalEscape);
    return () => document.removeEventListener('keydown', onGlobalEscape);
  }, [onClose]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImage({ base64: ev.target.result.split(',')[1], name: file.name, type: file.type, preview: ev.target.result });
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Please describe the product.'); return; }
    if (!image) { setError('Please attach a reference image.'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/product-request', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ description: description.trim(), qty: qty.trim() || null, imageBase64: image.base64, imageName: image.name, imageType: image.type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send.');
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="topnav-modal-backdrop" onClick={onClose}>
      <div
        className="topnav-modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-request-title"
      >
        <button ref={closeButtonRef} className="topnav-modal-close" onClick={onClose} type="button" aria-label="Close product request"><X size={18} /></button>
        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <PackageSearch size={40} style={{ color: '#8B1A1A', margin: '0 auto 16px', display: 'block' }} />
            <h2 id="product-request-title" style={{ marginBottom: 8 }}>Request sent!</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Our team will get back to you shortly.</p>
            <button onClick={onClose} style={{ marginTop: 20, padding: '10px 24px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
              <PackageSearch size={20} style={{ color: '#8B1A1A', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h2 id="product-request-title" style={{ margin: 0, fontSize: 18 }}>Can't find what you're looking for?</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Describe the product and attach a reference image — we'll source it for you.</p>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Description <span style={{ color: '#e11d48' }}>*</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Size, colour, material, use case…" rows={3} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Quantity <span style={{ color: '#9ca3af', fontWeight: 500, textTransform: 'none', fontSize: 11 }}>(optional)</span></label>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 100" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Reference image <span style={{ color: '#e11d48' }}>*</span></label>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              <div
                role="button"
                tabIndex="0"
                aria-label={image ? 'Change reference image' : 'Attach a reference image'}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  fileRef.current?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                style={{ border: `2px dashed ${image ? '#d1d5db' : '#cbd5e1'}`, borderRadius: 10, minHeight: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 6, padding: image ? 0 : 14 }}>
                {image ? <><img src={image.preview} alt="ref" style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain', padding: 8 }} /><div style={{ fontSize: 12, color: '#6b7280', paddingBottom: 8 }}>Click or drop to change</div></> : <><Upload size={22} style={{ color: '#9ca3af' }} /><div style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>Drop image or click to browse</div></>}
              </div>
            </div>
            {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#7f1d1d', fontSize: 13 }}>{error}</div>}
            <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: 13, background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? <><Loader2 size={16} className="spin-icon" /> Sending…</> : <><PackageSearch size={16} /> Send Request</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MegaMenuSkeleton() {
  return (
    <div className="mega-menu-loading-skeleton" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, idx) => (
        <span key={idx} className="mega-menu-skeleton-row" />
      ))}
    </div>
  );
}

export default function Sidebar({ categories, path, navigate, onAllProducts, counts }) {
  // Keep the active department highlighted without forcing its flyout open on
  // first render. The menu appears only after deliberate pointer or keyboard
  // intent, so a deep-linked category never starts with its products obscured.
  const [openCategoryId, setOpenCategoryId] = useState(null);
  const [menuTopOffset, setMenuTopOffset] = useState(0);
  const [showRequest, setShowRequest] = useState(false);
  const containerRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const requestTriggerRef = useRef(null);

  const activeRoot = path?.[0] || null;

  const menuNode = useMemo(() => {
    const targetId = openCategoryId || activeRoot;
    return targetId ? categories.find((c) => c.id === targetId) : null;
  }, [activeRoot, categories, openCategoryId]);

  const visibleL2 = useMemo(() => (
    menuNode ? filterNavChildrenByCount(menuNode.children, [menuNode.id], counts, categories) : []
  ), [menuNode, counts, categories]);

  const menuOpen = Boolean(visibleL2.length && openCategoryId);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onGlobalEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpenCategoryId(null);
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
    };
    document.addEventListener('keydown', onGlobalEscape);
    return () => document.removeEventListener('keydown', onGlobalEscape);
  }, [menuOpen]);

  useEffect(() => () => window.clearTimeout(hoverTimerRef.current), []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let idleHandle;
    if (window.requestIdleCallback) {
      idleHandle = window.requestIdleCallback(() => preloadMegaMenu());
    } else {
      idleHandle = window.setTimeout(() => preloadMegaMenu(), 400);
    }
    return () => {
      if (window.cancelIdleCallback && typeof idleHandle === 'number') {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
    };
  }, []);

  const handleToggleL1 = (id, btnEl) => {
    window.clearTimeout(hoverTimerRef.current);
    preloadMegaMenu();
    if (btnEl) menuTriggerRef.current = btnEl;
    setOpenCategoryId(id);
    if (id && btnEl && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const btnRect = btnEl.getBoundingClientRect();
      setMenuTopOffset(Math.max(0, btnRect.top - containerRect.top));
    }
  };

  const handleHoverL1 = (id, btnEl) => {
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      handleToggleL1(id, btnEl);
    }, MENU_HOVER_INTENT_MS);
  };

  const closeMenu = ({ restoreFocus = false } = {}) => {
    window.clearTimeout(hoverTimerRef.current);
    setOpenCategoryId(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
    }
  };

  const closeProductRequest = () => {
    setShowRequest(false);
    window.requestAnimationFrame(() => requestTriggerRef.current?.focus());
  };

  const focusFirstFlyoutItem = () => {
    window.requestAnimationFrame(() => {
      const firstItem = containerRef.current?.querySelector('.mega-menu-flyout [data-menu-col="l2"]');
      firstItem?.focus();
    });
  };

  return (
    <div
      ref={containerRef}
      className="sidebar-container"
      onMouseLeave={() => closeMenu()}
      style={{ position: 'relative', height: '100%', backgroundColor: '#fff', zIndex: 100 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 210 }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }}>
          <CategoryNav
            categories={categories}
            path={path}
            navigate={navigate}
            onAllProducts={onAllProducts}
            counts={counts}
            openCategoryId={openCategoryId}
            onToggleL1={handleToggleL1}
            onHoverL1={handleHoverL1}
            onCloseFlyout={() => closeMenu()}
            onOpenFlyoutWithKeyboard={focusFirstFlyoutItem}
          />
        </div>

        {/* CTA buttons — below category list */}
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
          <button
            ref={requestTriggerRef}
            type="button"
            onClick={() => setShowRequest(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', border: '1.5px solid #e8eaed', borderRadius: 10, background: '#fafafa', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#374151', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#8B1A1A'; e.currentTarget.style.color = '#8B1A1A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e8eaed'; e.currentTarget.style.color = '#374151'; }}
          >
            <PackageSearch size={15} style={{ color: '#8B1A1A', flexShrink: 0 }} />
            Can't find it?
          </button>
          <button
            type="button"
            onClick={openIntercom}
            aria-label="Ask Proto — online"
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid rgba(212,173,86,0.55)', borderRadius: 10, background: '#101010', boxShadow: '0 6px 16px rgba(0,0,0,0.14)', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, color: '#fff', cursor: 'pointer', transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#D4AD56'; e.currentTarget.style.background = '#181818'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(139,26,26,0.2)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(212,173,86,0.55)'; e.currentTarget.style.background = '#101010'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.14)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <MessageCircle size={16} style={{ flexShrink: 0, color: '#D4AD56' }} />
            <span>Ask Proto</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: '#A7F3D0', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 3px rgba(34,197,94,0.14)' }} />
              Online
            </span>
          </button>
        </div>
      </div>

      {menuOpen && menuNode && (
        <Suspense fallback={<MegaMenuSkeleton />}>
          <LazyMegaMenu
            key={menuNode.id}
            l1Node={menuNode}
            navigate={navigate}
            counts={counts}
            categories={categories}
            onClose={(restoreFocus = false) => closeMenu({ restoreFocus })}
            topOffset={menuTopOffset}
          />
        </Suspense>
      )}

      {showRequest && <ProductRequestModal onClose={closeProductRequest} />}
    </div>
  );
}

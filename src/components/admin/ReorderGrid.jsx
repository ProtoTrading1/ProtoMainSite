import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grip, ImagePlus, Loader2, X } from 'lucide-react';
import categories from '../../data/categories.json';
import {
  fetchProductsByCategoryPath,
  invalidateAdminCache,
  moveProductsToCategory,
  regenerateCatalog,
  saveSortOrder,
} from '../../lib/products';
import ReorderThumb from './ReorderThumb';

const CATEGORY_WORK_SIZE = 400;

function subcategoryOptions(categoryId) {
  return categories.find((item) => item.id === categoryId)?.children || [];
}

function leafOptions(categoryId, subcategoryId) {
  const sub = subcategoryOptions(categoryId).find((item) => item.id === subcategoryId);
  return sub?.children || [];
}

function buildFilterPath(deptId, subId, leafId) {
  const path = [];
  if (deptId) path.push(deptId);
  if (subId === '__unassigned__') return [...path, '__unassigned__'];
  if (subId) path.push(subId);
  if (leafId) path.push(leafId);
  return path;
}

export default function ReorderGrid({ onContentEdit, registerPatch }) {
  const [deptId, setDeptId] = useState(categories[0]?.id || '');
  const [subId, setSubId] = useState('');
  const [leafId, setLeafId] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null); // { id, position: 'before' | 'after' }
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDept, setMoveDept] = useState('');
  const [moveSub, setMoveSub] = useState('');
  const [moveLeaf, setMoveLeaf] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);

  const gridRef = useRef(null);
  const dragGhostRef = useRef(null);

  const mainCategories = useMemo(
    () => categories.map((item) => ({ id: item.id, label: item.label })),
    [],
  );

  const subs = useMemo(() => subcategoryOptions(deptId), [deptId]);
  const leaves = useMemo(() => (subId && subId !== '__unassigned__' ? leafOptions(deptId, subId) : []), [deptId, subId]);
  const filterPath = useMemo(() => buildFilterPath(deptId, subId, leafId), [deptId, subId, leafId]);

  const moveSubs = useMemo(() => subcategoryOptions(moveDept), [moveDept]);
  const moveLeaves = useMemo(() => (moveSub ? leafOptions(moveDept, moveSub) : []), [moveDept, moveSub]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchProductsByCategoryPath(filterPath, { limit: CATEGORY_WORK_SIZE });
      setProducts(rows);
    } finally {
      setLoading(false);
    }
  }, [filterPath]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!registerPatch) return undefined;
    registerPatch((id, patch) => {
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    });
    return () => registerPatch(null);
  }, [registerPatch]);

  useEffect(() => {
    if (!statusMsg) return undefined;
    const t = setTimeout(() => setStatusMsg(''), 4000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  const persistOrder = (next) => {
    const updates = next.map((p, i) => ({ websiteSku: p.id, sortOrder: i + 1 }));
    saveSortOrder(updates)
      .then(() => regenerateCatalog().catch(() => {}))
      .catch(console.error);
  };

  const getMovingSet = (id) => (selectedIds.has(id) ? selectedIds : new Set([id]));

  const reorderList = (prev, movingIds, insertBeforeId) => {
    const moving = prev.filter((p) => movingIds.has(p.id));
    const rest = prev.filter((p) => !movingIds.has(p.id));
    const insertAt = insertBeforeId ? rest.findIndex((p) => p.id === insertBeforeId) : rest.length;
    if (insertBeforeId && insertAt < 0) return prev;
    const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
    persistOrder(next);
    return next;
  };

  const moveSelectedToTop = () => {
    if (!selectedIds.size) return;
    setProducts((prev) => {
      const moving = prev.filter((p) => selectedIds.has(p.id));
      const rest = prev.filter((p) => !selectedIds.has(p.id));
      const next = [...moving, ...rest];
      persistOrder(next);
      return next;
    });
    setSelectedIds(new Set());
  };

  const dropToEnd = () => {
    if (!dragId) return;
    const toMove = getMovingSet(dragId);
    setProducts((prev) => reorderList(prev, toMove, null));
    setDragId(null);
    setDragOver(null);
  };

  const dropAt = (targetId, position) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOver(null);
      return;
    }
    const toMove = getMovingSet(dragId);
    if (toMove.has(targetId)) {
      setDragId(null);
      setDragOver(null);
      return;
    }
    setProducts((prev) => {
      const moving = prev.filter((p) => toMove.has(p.id));
      const rest = prev.filter((p) => !toMove.has(p.id));
      let insertAt = rest.findIndex((p) => p.id === targetId);
      if (insertAt < 0) return prev;
      if (position === 'after') insertAt += 1;
      const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
      persistOrder(next);
      return next;
    });
    setDragId(null);
    setDragOver(null);
  };

  const handleDragStart = (e, product) => {
    const toMove = getMovingSet(product.id);
    setDragId(product.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', product.id);

    const ghost = dragGhostRef.current;
    if (ghost) {
      const count = toMove.size;
      ghost.textContent = count > 1 ? `${count} items` : product.name;
      e.dataTransfer.setDragImage(ghost, 40, 20);
    }
  };

  const handleCardDragOver = (e, product) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragId || product.id === dragId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDragOver({ id: product.id, position });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map((p) => p.id)));
  };

  const openMoveModal = () => {
    setMoveDept(deptId);
    setMoveSub(subId && subId !== '__unassigned__' ? subId : subs[0]?.id || '');
    setMoveLeaf(leafId || '');
    setMoveOpen(true);
  };

  const confirmMove = async () => {
    if (!selectedIds.size || !moveDept) return;
    const categoryPath = [moveDept, moveSub, moveLeaf].filter(Boolean);
    setMoveSaving(true);
    try {
      const moves = [...selectedIds].map((websiteSku) => ({ websiteSku, categoryPath }));
      await moveProductsToCategory(moves);
      await regenerateCatalog().catch(() => {});
      setProducts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setMoveOpen(false);
      setStatusMsg(`Moved ${moves.length} product${moves.length === 1 ? '' : 's'}`);
    } catch (err) {
      setStatusMsg(err.message || 'Move failed');
    } finally {
      setMoveSaving(false);
    }
  };

  // Auto-scroll while dragging
  useEffect(() => {
    if (!dragId) return undefined;
    const onMove = (e) => {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const edge = 60;
      if (e.clientY < rect.top + edge) el.scrollTop -= 12;
      else if (e.clientY > rect.bottom - edge) el.scrollTop += 12;
    };
    window.addEventListener('dragover', onMove);
    return () => window.removeEventListener('dragover', onMove);
  }, [dragId]);

  return (
    <div className="adm-panel">
      <div ref={dragGhostRef} className="adm-reorder-drag-ghost" aria-hidden="true" />

      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Reorder Grid</h2>
          <p className="adm-section-note">
            Browse by department and subcategory. Drag to reorder — changes save to the database immediately.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <>
              <span className="adm-pill">{selectedIds.size} selected</span>
              <button type="button" onClick={moveSelectedToTop} className="adm-btn-red">Move to top</button>
              <button type="button" onClick={openMoveModal} className="adm-btn-red">Move to category</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="adm-btn-ghost">Clear</button>
            </>
          )}
          <select
            value={deptId}
            onChange={(e) => {
              setSelectedIds(new Set());
              setDeptId(e.target.value);
              setSubId('');
              setLeafId('');
            }}
            className="adm-select"
          >
            {mainCategories.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleSelectAll}
            className="adm-btn-ghost"
          >
            {selectedIds.size === products.length && products.length ? 'Clear all' : 'Select all'}
          </button>
          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); invalidateAdminCache(); void loadProducts(); }}
            className="adm-btn-ghost"
            title="Reload from database"
          >
            Refresh
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="adm-reorder-status">{statusMsg}</div>
      )}

      {/* L2 subcategory pills */}
      <div className="adm-reorder-pills">
        <button
          type="button"
          className={`adm-reorder-pill${!subId ? ' adm-reorder-pill--active' : ''}`}
          onClick={() => { setSubId(''); setLeafId(''); setSelectedIds(new Set()); }}
        >
          All
        </button>
        <button
          type="button"
          className={`adm-reorder-pill${subId === '__unassigned__' ? ' adm-reorder-pill--active' : ''}`}
          onClick={() => { setSubId('__unassigned__'); setLeafId(''); setSelectedIds(new Set()); }}
        >
          Unassigned
        </button>
        {subs.map((sub) => (
          <button
            key={sub.id}
            type="button"
            className={`adm-reorder-pill${subId === sub.id ? ' adm-reorder-pill--active' : ''}`}
            onClick={() => { setSubId(sub.id); setLeafId(''); setSelectedIds(new Set()); }}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* L3 product-type pills */}
      {leaves.length > 0 && subId && subId !== '__unassigned__' && (
        <div className="adm-reorder-pills adm-reorder-pills--l3">
          <button
            type="button"
            className={`adm-reorder-pill${!leafId ? ' adm-reorder-pill--active' : ''}`}
            onClick={() => { setLeafId(''); setSelectedIds(new Set()); }}
          >
            All types
          </button>
          {leaves.map((leaf) => (
            <button
              key={leaf.id}
              type="button"
              className={`adm-reorder-pill${leafId === leaf.id ? ' adm-reorder-pill--active' : ''}`}
              onClick={() => { setLeafId(leaf.id); setSelectedIds(new Set()); }}
            >
              {leaf.label}
            </button>
          ))}
        </div>
      )}

      <div className="adm-reorder-meta">
        {loading ? (
          <span className="adm-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
          </span>
        ) : (
          <span className="adm-pill">{products.length} products</span>
        )}
      </div>

      {/* Top drop zone */}
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragOver({ id: '__top__', position: 'before' }); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
        onDrop={(e) => {
          e.preventDefault();
          if (!dragId) return;
          const toMove = getMovingSet(dragId);
          setProducts((prev) => reorderList(prev, toMove, prev[0]?.id));
          setDragId(null);
          setDragOver(null);
        }}
        className={`adm-reorder-top-zone${dragId ? ' adm-reorder-top-zone--visible' : ''}${dragOver?.id === '__top__' ? ' adm-reorder-top-zone--over' : ''}`}
      >
        ↑ Drop here to move to top
      </div>

      <div ref={gridRef} className="adm-reorder-grid-scroll">
        <div className="adm-reorder-grid">
          {products.map((product) => {
            const isDragging = dragId === product.id || (dragId && selectedIds.has(product.id) && selectedIds.has(dragId));
            const isSelected = selectedIds.has(product.id);
            const showBefore = dragOver?.id === product.id && dragOver.position === 'before';
            const showAfter = dragOver?.id === product.id && dragOver.position === 'after';

            return (
              <div key={product.id} className="adm-reorder-card-wrap">
                {showBefore && <div className="adm-reorder-insert-line" />}
                <div
                  className={`adm-reorder-card${isDragging ? ' adm-reorder-card--dragging' : ''}${isSelected ? ' adm-reorder-card--selected' : ''}`}
                  onDragOver={(e) => handleCardDragOver(e, product)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                    dropAt(product.id, position);
                  }}
                >
                  <div className="adm-reorder-handle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(product.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer', accentColor: '#8B1A1A' }}
                    />
                    <span
                      className="adm-reorder-grip"
                      draggable
                      onDragStart={(e) => handleDragStart(e, product)}
                      onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    >
                      <Grip size={14} />
                      <span className="adm-muted" style={{ fontSize: 10 }}>
                        {isSelected ? 'selected' : 'drag'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onContentEdit?.(product)}
                      className="adm-icon-btn"
                      title="Edit image & description"
                    >
                      <ImagePlus size={13} />
                    </button>
                  </div>
                  <div className="adm-thumb">
                    <ReorderThumb src={product.image} alt={product.name} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8 }}>{product.name}</div>
                  <div className="adm-muted" style={{ fontSize: 11 }}>{product.code}</div>
                  {product.categoryPath?.length > 1 && (
                    <div className="adm-muted" style={{ fontSize: 10, marginTop: 4 }}>
                      {product.categoryPath.slice(1).join(' / ')}
                    </div>
                  )}
                </div>
                {showAfter && <div className="adm-reorder-insert-line" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom drop zone */}
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragOver({ id: '__bottom__', position: 'after' }); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
        onDrop={(e) => { e.preventDefault(); dropToEnd(); }}
        className={`adm-reorder-bottom-zone${dragId ? ' adm-reorder-bottom-zone--visible' : ''}${dragOver?.id === '__bottom__' ? ' adm-reorder-bottom-zone--over' : ''}`}
      >
        ↓ Drop here to move to end
      </div>

      {/* Move to category modal */}
      {moveOpen && (
        <div className="adm-modal-backdrop" onClick={() => !moveSaving && setMoveOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'Outfit, sans-serif' }}>Move to category</h3>
              <button type="button" onClick={() => setMoveOpen(false)} className="adm-icon-btn" disabled={moveSaving}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <p className="adm-muted" style={{ margin: 0 }}>
                Move {selectedIds.size} selected product{selectedIds.size === 1 ? '' : 's'} to:
              </p>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Department</span>
                <select
                  value={moveDept}
                  onChange={(e) => { setMoveDept(e.target.value); setMoveSub(''); setMoveLeaf(''); }}
                  className="adm-field-input"
                >
                  {mainCategories.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Subcategory</span>
                <select
                  value={moveSub}
                  onChange={(e) => { setMoveSub(e.target.value); setMoveLeaf(''); }}
                  className="adm-field-input"
                >
                  <option value="">— None —</option>
                  {moveSubs.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              {moveLeaves.length > 0 && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Product type</span>
                  <select
                    value={moveLeaf}
                    onChange={(e) => setMoveLeaf(e.target.value)}
                    className="adm-field-input"
                  >
                    <option value="">— None —</option>
                    {moveLeaves.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" onClick={() => setMoveOpen(false)} className="adm-btn-ghost" disabled={moveSaving}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirmMove()} className="adm-btn-red" disabled={moveSaving}>
                {moveSaving ? 'Moving…' : 'Move products'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

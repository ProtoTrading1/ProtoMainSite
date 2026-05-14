import { useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';

export default function ReorderModal({ lastOrder, onReorder, onClose }) {
  const [selected, setSelected] = useState(() =>
    new Set((lastOrder?.items || []).map((_, i) => i))
  );

  if (!lastOrder) return null;

  const items = lastOrder.items || [];
  const toggleItem = (idx) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    return next;
  });

  const handleReorder = () => {
    const selectedItems = items.filter((_, i) => selected.has(i));
    onReorder(selectedItems);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Outfit, sans-serif', color: '#0f172a' }}>Reorder</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
              From {new Date(lastOrder.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>Select items to add back to your current order:</p>
          {items.map((item, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggleItem(i)}
                style={{ width: '16px', height: '16px', accentColor: '#e11d48' }}
              />
              {item.image && (
                <img src={item.image} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', background: '#f8fafc', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.code} · qty {item.qty} · R{Number(item.unitPrice).toFixed(2)} each</div>
              </div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#e11d48', flexShrink: 0 }}>
                R{(item.unitPrice * item.qty).toFixed(2)}
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}>
            Cancel
          </button>
          <button
            onClick={handleReorder}
            disabled={selected.size === 0}
            style={{ flex: 2, padding: '12px', background: '#e11d48', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', color: '#fff', opacity: selected.size === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <ShoppingCart size={16} />
            Add {selected.size} item{selected.size !== 1 ? 's' : ''} to order
          </button>
        </div>
      </div>
    </div>
  );
}

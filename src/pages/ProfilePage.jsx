import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Package, ShieldCheck, Star } from 'lucide-react';
import { updateProfile } from '../lib/customers';
import { fetchOrderHistory } from '../lib/orders';

export default function ProfilePage({ customer, onBack, onProfileUpdate }) {
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    delivery_address: customer?.delivery_address || '',
  });
  const [orders, setOrders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customer?.id) return;
    fetchOrderHistory(customer.id, 5).then(setOrders).catch(() => {});
  }, [customer?.id]);

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      const updated = await updateProfile(customer.id, form);
      onProfileUpdate?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const isPremium = customer?.tier === 'premium';
  const latestOrder = orders[0] || null;
  const latestItem = latestOrder?.items?.[0] || null;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1e293b', padding: '0 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px', height: '60px' }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={16} /> Back to Portal
          </button>
          <div style={{ height: '20px', width: '1px', background: '#1e293b' }} />
          <div style={{ fontWeight: '900', fontSize: '16px', fontFamily: 'Outfit, sans-serif' }}>
            <span style={{ color: '#fff' }}>PROTO </span>
            <span style={{ color: '#e11d48' }}>TRADING</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Profile card */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '28px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'Outfit, sans-serif', color: '#0f172a' }}>My Profile</h1>
              <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>{customer?.email}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '99px',
                background: isPremium ? '#78350f' : '#f1f5f9', color: isPremium ? '#fbbf24' : '#64748b',
                fontWeight: '700', fontSize: '13px' }}>
                {isPremium ? <Star size={14} fill="#fbbf24" /> : <ShieldCheck size={14} />}
                {isPremium ? 'Proto Premium' : 'Proto Regular'}
              </div>
              {!isPremium && (
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Order R4,000+ with 10+ of one item to upgrade
                </span>
              )}
            </div>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#7F1D1D', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              ['Full Name', 'name', 'text', 'Jane Smith'],
              ['Contact Number', 'phone', 'tel', '+27 82 000 0000'],
            ].map(([label, key, type, placeholder]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{label}</label>
                <input
                  type={type} value={form[key]} onChange={set(key)} placeholder={placeholder}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#0f172a', outline: 'none' }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginTop: '18px' }}>
            {[
              ['Email', customer?.email || '—'],
              ['Delivery Address', form.delivery_address || 'Not saved yet'],
              ['Last Order', latestOrder ? new Date(latestOrder.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No order yet'],
              ['Last Item Ordered', latestItem ? `${latestItem.code} ×${latestItem.qty}` : 'No item yet'],
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{label}</div>
                <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: '600', lineHeight: 1.4 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Delivery Address
            </label>
            <textarea
              value={form.delivery_address} onChange={set('delivery_address')}
              placeholder="Street address, suburb, city, postcode"
              rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#0f172a', outline: 'none', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
              {saving ? <Loader2 size={15} /> : saved ? <CheckCircle2 size={15} /> : null}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Order history */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '28px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Outfit, sans-serif', color: '#0f172a', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} /> Order History
          </h2>

          {orders.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>No orders placed yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {orders.map((order, i) => (
                <div key={order.id} style={{ border: '1px solid #f1f5f9', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>
                        Order {i === 0 ? '(Latest)' : `#${orders.length - i}`}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '800', fontSize: '16px', color: '#e11d48' }}>R{Number(order.total_ex_vat).toFixed(2)}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>excl. VAT</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(order.items || []).map((item, j) => (
                      <div key={j} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#475569' }}>
                        {item.code} ×{item.qty}
                      </div>
                    ))}
                  </div>
                  {i === 0 && order.items?.[0] && (
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#e11d48', fontWeight: '700' }}>
                      Last ordered item: {order.items[0].name} ({order.items[0].code})
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

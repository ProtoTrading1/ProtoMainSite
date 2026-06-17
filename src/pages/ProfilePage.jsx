import { useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, CheckCircle2, Globe, Loader2, Mail,
  MapPin, Package, Phone, ShieldCheck, Store, User,
} from 'lucide-react';
import { updateProfile } from '../lib/customers';
import { fetchOrderHistory } from '../lib/orders';

function ProfileField({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', border: '1px solid #e8eaed', borderRadius: 12, background: '#f8fafc' }}>
      <Icon size={14} style={{ color: '#6b7280', marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      </div>
    </div>
  );
}

export default function ProfilePage({ customer, onBack, onProfileUpdate }) {
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    delivery_address: customer?.delivery_address || '',
    business_type: customer?.business_type || '',
    monthly_spend: customer?.monthly_spend || '',
    website: customer?.website || '',
  });
  const SPEND_BANDS = ['R0 – R5,000', 'R5,000 – R10,000', 'R10,000 – R25,000', 'R25,000 – R50,000', 'R50,000+'];
  const [orders, setOrders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customer?.id) return;
    fetchOrderHistory(customer.id, 10).then(setOrders).catch(() => {});
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

  const latestOrder = orders[0] || null;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#000', borderBottom: '1px solid #1a1a1a', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, height: 64, padding: '0 24px' }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 14, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}>
            <ArrowLeft size={16} /> Back to Portal
          </button>
          <div style={{ height: 18, width: 1, background: '#2a2a2a' }} />
          <div style={{ fontWeight: 900, fontSize: 16, fontFamily: 'Outfit, sans-serif' }}>
            <span style={{ color: '#fff' }}>PROTO </span>
            <span style={{ color: '#8B1A1A' }}>TRADING</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 60px', display: 'grid', gap: 20 }}>

        {/* Trade Profile card — read-only business details */}
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 20, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#0f172a' }}>Trade Profile</h2>
              <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{customer?.email}</p>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: '#f1f5f9', color: '#374151', fontWeight: 700, fontSize: 13 }}>
              <ShieldCheck size={14} style={{ color: '#16a34a' }} />
              Approved Trade Account
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            <ProfileField icon={Building2} label="Business name" value={customer?.business_name} />
            <ProfileField icon={User} label="Contact person" value={customer?.name} />
            <ProfileField icon={Mail} label="Email" value={customer?.email} />
            <ProfileField icon={Phone} label="Phone" value={customer?.phone} />
            <ProfileField icon={Store} label="Business type" value={customer?.business_type} />
            {customer?.monthly_spend && <ProfileField icon={Store} label="Monthly spend" value={customer.monthly_spend} />}
            {customer?.website && <ProfileField icon={Globe} label="Website / social" value={customer.website} />}
            {customer?.vat_number && <ProfileField icon={ShieldCheck} label="VAT number" value={customer.vat_number} />}
            {customer?.company_address && <ProfileField icon={MapPin} label="Company address" value={customer.company_address} />}
          </div>
        </div>

        {/* My Details — editable */}
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 20, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#0f172a' }}>My Details</h2>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#7F1D1D', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {[['Full name', 'name', 'text', 'Jane Smith'], ['Contact number', 'phone', 'tel', '+27 82 000 0000']].map(([label, key, type, placeholder]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</label>
                <input
                  type={type} value={form[key]} onChange={set(key)} placeholder={placeholder}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  onFocus={(e) => e.target.style.borderColor = '#8B1A1A'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Business type</label>
              <input
                type="text" value={form.business_type} onChange={set('business_type')} placeholder="e.g. Retail store"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                onFocus={(e) => e.target.style.borderColor = '#8B1A1A'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Monthly spend</label>
              <select
                value={form.monthly_spend} onChange={set('monthly_spend')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }}
                onFocus={(e) => e.target.style.borderColor = '#8B1A1A'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              >
                <option value="">Select…</option>
                {SPEND_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Website or social media</label>
            <input
              type="text" value={form.website} onChange={set('website')} placeholder="www.yourshop.co.za or @yourshop"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              onFocus={(e) => e.target.style.borderColor = '#8B1A1A'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Delivery address</label>
            <textarea
              value={form.delivery_address} onChange={set('delivery_address')}
              placeholder="Street address, suburb, city, postcode"
              rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              onFocus={(e) => e.target.style.borderColor = '#8B1A1A'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', background: saving ? '#6b7280' : saved ? '#16a34a' : '#8B1A1A', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
          >
            {saving ? <><Loader2 size={15} className="spin-icon" /> Saving…</> : saved ? <><CheckCircle2 size={15} /> Saved!</> : 'Save Changes'}
          </button>
        </div>

        {/* Order history */}
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 20, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={20} style={{ color: '#8B1A1A' }} /> Order History
          </h2>

          {orders.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>No orders placed yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {orders.map((order, i) => (
                <div key={order.id} style={{ border: '1px solid #e8eaed', borderRadius: 12, padding: 16, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                        {order.order_number || order.id.slice(0, 8)}
                        {i === 0 && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: '#8B1A1A', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>Latest</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: 16, color: '#8B1A1A', fontFamily: 'Outfit, sans-serif' }}>R{Number(order.total_ex_vat || 0).toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>excl. VAT</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(order.items || []).map((item, j) => (
                      <div key={j} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#475569', fontWeight: 600 }}>
                        {item.code} ×{item.qty}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

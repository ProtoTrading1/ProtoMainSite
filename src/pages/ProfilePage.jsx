import { useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, CheckCircle2, Globe, Loader2, Mail, MessageCircle,
  MapPin, Phone, ShieldCheck, Store, User,
} from 'lucide-react';
import { updateProfile } from '../lib/customers';
import { fetchOrderHistory } from '../lib/orders';
import MyOrdersCentre from '../components/MyOrdersCentre';
import { MONTHLY_SPEND_BANDS } from '../lib/businessTypes';
import { SADC_COUNTRIES, SA_PROVINCES } from '../lib/sadcCountries';
import {
  BUILDING_TYPES, SELECTABLE_BUSINESS_TYPES,
  buildProfileForm, buildProfilePatch, validateProfileForm,
} from '../lib/profileForm';

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

function whatsappLabel(value) {
  if (value === true) return 'On — order updates, stock alerts & specials';
  if (value === false) return 'Off — no WhatsApp updates';
  return null;
}

function structuredDeliverySummary(customer) {
  const parts = [
    customer?.street_name,
    customer?.suburb,
    customer?.city,
    customer?.postal_code,
    customer?.country,
  ].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return customer?.delivery_address || '';
}

const LABEL_STYLE = { display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 };
const CONTROL_STYLE = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };

const focusProps = {
  onFocus: (e) => { e.target.style.borderColor = '#8B1A1A'; },
  onBlur: (e) => { e.target.style.borderColor = '#e2e8f0'; },
};

function Field({ label, hint, children, full = false }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

export default function ProfilePage({ customer, onBack, onProfileUpdate, onReorderOrder }) {
  const [form, setForm] = useState(() => buildProfileForm(customer));
  const [orders, setOrders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // The customer row can arrive (or be refreshed) after the first render.
  // Keyed on the id only — depending on the object itself would discard
  // whatever the customer is typing on every parent re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForm(buildProfileForm(customer)); }, [customer?.id]);

  useEffect(() => {
    if (!customer?.id) return;
    fetchOrderHistory(customer.id, 10).then(setOrders).catch(() => {});
  }, [customer?.id]);

  const handleSave = async () => {
    const problem = validateProfileForm(form);
    if (problem) { setError(problem); setSaved(false); return; }
    setSaving(true); setSaved(false); setError('');
    try {
      const updated = await updateProfile(customer.id, buildProfilePatch(form));
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

  const deliverySummary = structuredDeliverySummary(customer);
  const isSouthAfrica = form.country === 'South Africa';
  const hasStructuredAddress = ['street_name', 'suburb', 'city', 'postal_code']
    .some((key) => String(form[key] || '').trim());

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

        <MyOrdersCentre orders={orders} onReorderOrder={onReorderOrder} />

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
            {customer?.customer_code && <ProfileField icon={ShieldCheck} label="Customer code" value={customer.customer_code} />}
            <ProfileField icon={MessageCircle} label="WhatsApp updates" value={whatsappLabel(customer?.accept_whatsapp)} />
            <ProfileField icon={Store} label="Business type" value={customer?.business_type} />
            <ProfileField icon={Store} label="Monthly spend" value={customer?.monthly_spend} />
            <ProfileField icon={Globe} label="Website / social" value={customer?.website} />
            <ProfileField icon={ShieldCheck} label="VAT number" value={customer?.vat_number} />
            <ProfileField icon={MapPin} label="Billing address" value={customer?.company_address} />
            <ProfileField icon={MapPin} label="Delivery address" value={deliverySummary} />
            {customer?.building_type && <ProfileField icon={Building2} label="Building type" value={customer.building_type} />}
            {customer?.unit_number && <ProfileField icon={Building2} label="Unit / apartment" value={customer.unit_number} />}
            {customer?.province && <ProfileField icon={MapPin} label="Province / region" value={customer.province} />}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
            <Field label="Full name">
              <input type="text" value={form.name} onChange={set('name')} placeholder="Jane Smith" style={CONTROL_STYLE} {...focusProps} />
            </Field>
            <Field label="Contact number">
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+27 82 000 0000" style={CONTROL_STYLE} {...focusProps} />
            </Field>

            <Field label="Type of store">
              <select value={form.business_type} onChange={set('business_type')} style={CONTROL_STYLE} {...focusProps}>
                <option value="">Select your type of store…</option>
                {SELECTABLE_BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="Other">Other</option>
              </select>
            </Field>
            {form.business_type === 'Other' && (
              <Field label="Describe your business">
                <input type="text" value={form.business_type_other} onChange={set('business_type_other')} placeholder="e.g. Toy importer" style={CONTROL_STYLE} {...focusProps} />
              </Field>
            )}

            <Field label="Monthly spend">
              <select value={form.monthly_spend} onChange={set('monthly_spend')} style={CONTROL_STYLE} {...focusProps}>
                <option value="">Select…</option>
                {MONTHLY_SPEND_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>

            <Field label="Website or social media" full>
              <input type="text" value={form.website} onChange={set('website')} placeholder="www.yourshop.co.za or @yourshop" style={CONTROL_STYLE} {...focusProps} />
            </Field>
          </div>

          <div style={{ borderTop: '1px solid #e8eaed', paddingTop: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#0f172a' }}>Delivery address</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>Where we deliver your orders. This is what prints on your invoices and packing slips.</p>

            {!hasStructuredAddress && customer?.delivery_address && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#78350f', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
                Currently on your account: <strong>{customer.delivery_address}</strong><br />
                Fill in the fields below to update it.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Field label="Street name and number">
                <input type="text" value={form.street_name} onChange={set('street_name')} placeholder="12 Main Road" style={CONTROL_STYLE} {...focusProps} />
              </Field>
              <Field label="Suburb">
                <input type="text" value={form.suburb} onChange={set('suburb')} placeholder="Suburb" style={CONTROL_STYLE} {...focusProps} />
              </Field>
              <Field label="City">
                <input type="text" value={form.city} onChange={set('city')} placeholder="City" style={CONTROL_STYLE} {...focusProps} />
              </Field>
              <Field label="Postal code">
                <input type="text" value={form.postal_code} onChange={set('postal_code')} placeholder="0000" style={CONTROL_STYLE} {...focusProps} />
              </Field>

              <Field label="Country">
                <select
                  value={form.country}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    country: e.target.value,
                    province: e.target.value === 'South Africa' ? f.province : '',
                  }))}
                  style={CONTROL_STYLE}
                  {...focusProps}
                >
                  {SADC_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              {isSouthAfrica && (
                <Field label="Province">
                  <select value={form.province} onChange={set('province')} style={CONTROL_STYLE} {...focusProps}>
                    <option value="">Select province…</option>
                    {SA_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Building type">
                <select
                  value={form.building_type}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    building_type: e.target.value,
                    unit_number: e.target.value === 'Apartments' ? f.unit_number : '',
                    building_type_other: e.target.value === 'Other' ? f.building_type_other : '',
                  }))}
                  style={CONTROL_STYLE}
                  {...focusProps}
                >
                  <option value="">Select…</option>
                  {BUILDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="Other">Other</option>
                </select>
              </Field>
              {form.building_type === 'Other' && (
                <Field label="Describe building type">
                  <input type="text" value={form.building_type_other} onChange={set('building_type_other')} placeholder="e.g. Warehouse, Industrial unit" style={CONTROL_STYLE} {...focusProps} />
                </Field>
              )}
              {form.building_type === 'Apartments' && (
                <Field label="Unit / apartment number">
                  <input type="text" value={form.unit_number} onChange={set('unit_number')} placeholder="Unit number" style={CONTROL_STYLE} {...focusProps} />
                </Field>
              )}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', background: saving ? '#6b7280' : saved ? '#16a34a' : '#8B1A1A', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
          >
            {saving ? <><Loader2 size={15} className="spin-icon" /> Saving…</> : saved ? <><CheckCircle2 size={15} /> Saved!</> : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}

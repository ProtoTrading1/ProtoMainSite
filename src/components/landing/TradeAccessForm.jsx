import { useState } from 'react';
import { Send, CheckCircle, Info, Building2, Phone, MessageCircle } from 'lucide-react';

export default function TradeAccessForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(null); // null | true | false
  const [formData, setFormData] = useState({
    businessName: '',
    contactName: '',
    email: '',
    password: '',
    phone: '',
    businessType: '',
    address: '',
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/register-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          contactName: formData.contactName,
          businessName: formData.businessName,
          phone: formData.phone,
          businessType: formData.businessType,
          address: formData.address,
          whatsappOptIn: whatsappOptIn === true,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Registration failed. Please try again.');
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const phoneEntered = formData.phone.replace(/\D/g, '').length >= 8;

  if (submitted) {
    return (
      <section className="section-padding" style={{ backgroundColor: '#fff' }}>
        <div className="container" style={{ textAlign: 'center', maxWidth: '600px' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            backgroundColor: 'var(--proto-red-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 32px'
          }}>
            <CheckCircle size={40} color="var(--proto-red)" />
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '16px', fontFamily: 'Outfit' }}>Application Received</h2>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
            Thank you for applying for trade access. Our team will review your business details and contact you within 24-48 hours.
          </p>
          {whatsappOptIn && (
            <p style={{ fontSize: '15px', color: '#25D366', fontWeight: '600', marginBottom: '32px' }}>
              You'll receive a WhatsApp welcome message shortly.
            </p>
          )}
          <button onClick={() => setSubmitted(false)} className="btn-outline" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-light)' }}>
            Back to Home
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="trade-access-form" className="section-padding" style={{ backgroundColor: 'var(--bg-main)' }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '80px', alignItems: 'start' }} className="grid-2">
          <div>
            <h2 style={{ fontSize: '42px', fontWeight: '800', marginBottom: '24px', color: 'var(--text-primary)', fontFamily: 'Outfit' }}>
              Register for Trade Access
            </h2>
            <p style={{ fontSize: '18px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '40px', fontWeight: '500' }}>
              Join thousands of retailers who trust Proto Trading for their wholesale needs. Complete the form to start the verification process.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {[
                { Icon: Building2, title: 'B2B Exclusive', text: 'Pricing and ordering portal available to registered businesses only.' },
                { Icon: Info, title: 'Verification', text: 'We review all applications to maintain the integrity of our wholesale network.' },
                { Icon: Phone, title: 'Support', text: 'Our trade support team is available Mon-Fri, 9am-5pm for assistance.' },
              ].map(({ Icon, title, text }) => (
                <div key={title} style={{ display: 'flex', gap: '20px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    backgroundColor: '#fff', border: '1px solid var(--border-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Icon size={22} color="var(--proto-red)" />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px', fontFamily: 'Outfit' }}>{title}</h4>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '48px', borderRadius: '24px', boxShadow: 'var(--shadow-premium)', border: '1px solid var(--border-light)' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="grid-2">
                <div className="premium-form-group">
                  <label className="premium-label">Business Name</label>
                  <input type="text" name="businessName" className="premium-input" placeholder="Legal business name" required onChange={handleChange} />
                </div>
                <div className="premium-form-group">
                  <label className="premium-label">Contact Person</label>
                  <input type="text" name="contactName" className="premium-input" placeholder="Full name" required onChange={handleChange} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="grid-2">
                <div className="premium-form-group">
                  <label className="premium-label">Email Address</label>
                  <input type="email" name="email" className="premium-input" placeholder="work@company.com" required onChange={handleChange} />
                </div>
                <div className="premium-form-group">
                  <label className="premium-label">Password</label>
                  <input type="password" name="password" className="premium-input" placeholder="Min. 8 characters" required minLength={8} onChange={handleChange} />
                </div>
              </div>

              <div className="premium-form-group">
                <label className="premium-label">Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  className="premium-input"
                  placeholder="+27 82 000 0000"
                  required
                  onChange={handleChange}
                  value={formData.phone}
                />
              </div>

              {/* WhatsApp opt-in — shown once a valid phone is entered */}
              {phoneEntered && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
                  gap: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <MessageCircle size={20} color="#16a34a" style={{ flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#15803d' }}>Join our WhatsApp channel?</p>
                      <p style={{ margin: 0, fontSize: '13px', color: '#4ade80', color: '#166534', opacity: 0.8 }}>Get updates, specials, and stock alerts.</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setWhatsappOptIn(true)}
                      style={{
                        padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                        cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                        backgroundColor: whatsappOptIn === true ? '#16a34a' : '#dcfce7',
                        color: whatsappOptIn === true ? '#fff' : '#15803d',
                        transition: 'all 0.15s',
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhatsappOptIn(false)}
                      style={{
                        padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                        cursor: 'pointer', border: '1px solid #d1d5db', fontFamily: 'inherit',
                        backgroundColor: whatsappOptIn === false ? '#f3f4f6' : '#fff',
                        color: '#6b7280',
                        transition: 'all 0.15s',
                      }}
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              <div className="premium-form-group">
                <label className="premium-label">Business Type</label>
                <select name="businessType" className="premium-input" required onChange={handleChange}>
                  <option value="">Select business type</option>
                  <option value="retailer">Retail Store</option>
                  <option value="online">Online Reseller</option>
                  <option value="wholesale">Wholesaler / Distributor</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="premium-form-group">
                <label className="premium-label">Business Address</label>
                <textarea name="address" className="premium-input" rows="3" placeholder="Full trading address" required onChange={handleChange} style={{ resize: 'none' }}></textarea>
              </div>

              {submitError && (
                <div style={{
                  backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                  borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
                  fontSize: '14px', color: '#dc2626',
                }}>
                  {submitError}
                </div>
              )}

              <button type="submit" className="btn-premium" style={{ width: '100%', padding: '16px', marginTop: '12px' }} disabled={submitting}>
                {submitting ? 'Submitting…' : <><Send size={18} /> Submit Application</>}
              </button>

              <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginTop: '24px' }}>
                By submitting, you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

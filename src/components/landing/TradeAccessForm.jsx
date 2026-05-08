import React, { useState } from 'react';
import { Send, CheckCircle, Info, Building2, User, Mail, Phone, MapPin } from 'lucide-react';

export default function TradeAccessForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    businessType: '',
    website: '',
    address: '',
    message: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

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
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '40px' }}>
            Thank you for applying for trade access. Our team will review your business details and contact you within 24-48 hours.
          </p>
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
                  <label className="premium-label">Phone Number</label>
                  <input type="tel" name="phone" className="premium-input" placeholder="+1 (555) 000-0000" required onChange={handleChange} />
                </div>
              </div>

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

              <button type="submit" className="btn-premium" style={{ width: '100%', padding: '16px', marginTop: '12px' }}>
                Submit Application <Send size={18} />
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

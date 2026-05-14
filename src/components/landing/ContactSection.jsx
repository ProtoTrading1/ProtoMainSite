import { Mail, HelpCircle, MessageCircle } from 'lucide-react';

const faqs = [
  { q: 'Who can register?', a: 'Exclusively for registered retailers, resellers, and professional trade buyers.' },
  { q: 'Approval Timeline', a: 'Most trade applications are reviewed and verified within 24 business hours.' },
  { q: 'Public Sales', a: 'Proto Trading is B2B only. All pricing and ordering is restricted to approved trade customers.' },
];

export default function ContactSection() {
  return (
    <section id="contact" className="section-padding" style={{ backgroundColor: '#fff', borderTop: '1px solid var(--border-light)' }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '80px' }} className="grid-2">
          {/* Contact */}
          <div>
            <h2 style={{ fontSize: '36px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '24px', fontFamily: 'Outfit' }}>Get in Touch</h2>
            <p style={{ fontSize: '17px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '40px', fontWeight: '500' }}>
              Have questions about trade access or volume orders? Our dedicated wholesale support team is ready to assist your business.
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
              <div style={{ 
                width: '56px', height: '56px', borderRadius: '16px', 
                backgroundColor: 'var(--proto-red-light)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center' 
              }}>
                <Mail size={24} color="var(--proto-red)" />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Trade Enquiries</div>
                <a href="mailto:orders@prototrading.co.za" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--proto-red)', fontFamily: 'Outfit' }}>orders@prototrading.co.za</a>
              </div>
            </div>

            <div style={{ 
              padding: '24px', backgroundColor: 'var(--bg-main)', 
              borderRadius: '16px', border: '1px solid var(--border-light)',
              display: 'flex', gap: '16px', alignItems: 'flex-start'
            }}>
              <MessageCircle size={20} color="var(--text-secondary)" style={{ marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, fontWeight: '500' }}>
                  Our Cape Town office is currently updating our phone systems. Direct trade support lines will be published here shortly.
                </p>
              </div>
            </div>
          </div>

          {/* FAQs */}
          <div>
            <h2 style={{ fontSize: '36px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '24px', fontFamily: 'Outfit' }}>Common Questions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {faqs.map(({ q, a }) => (
                <div key={q} className="category-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                    <HelpCircle size={18} color="var(--proto-red)" style={{ flexShrink: 0, marginTop: '3px' }} />
                    <h4 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Outfit' }}>{q}</h4>
                  </div>
                  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '30px' }}>{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

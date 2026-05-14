import { UserPlus, ShieldCheck, LayoutGrid } from 'lucide-react';

const steps = [
  { Icon: UserPlus,    num: '1', title: 'Apply for Access',    detail: 'Submit our trade registration form. We verify all applicants to maintain a secure B2B environment.' },
  { Icon: ShieldCheck, num: '2', title: 'Business Verification', detail: 'Our trade team reviews your credentials. Verified retailers receive portal login details via email.' },
  { Icon: LayoutGrid,  num: '3', title: 'Browse & Order',  detail: 'Gain full access to our 5,000+ products, view live trade pricing, and manage orders with ease.' },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="section-padding" style={{ backgroundColor: '#fff', borderTop: '1px solid var(--border-light)' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <h2 style={{ 
            fontSize: 'clamp(32px, 4vw, 42px)', 
            fontWeight: '800', 
            color: 'var(--text-primary)', 
            letterSpacing: '-1px', 
            marginBottom: '16px',
            fontFamily: 'Outfit'
          }}>
            Simplified Sourcing Process
          </h2>
          <p style={{ 
            fontSize: '18px', 
            color: 'var(--text-secondary)', 
            maxWidth: '640px', 
            margin: '0 auto', 
            lineHeight: 1.7,
            fontWeight: '500'
          }}>
            Three simple steps to join our professional wholesale network and start growing your retail business.
          </p>
        </div>

        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
          {steps.map(({ Icon, num, title, detail }) => (
            <div key={num} className="category-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
              <div style={{ 
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', 
                width: '64px', height: '64px', borderRadius: '16px', 
                backgroundColor: 'var(--proto-red-light)', marginBottom: '24px', position: 'relative' 
              }}>
                <Icon size={28} color="var(--proto-red)" />
                <span style={{ 
                  position: 'absolute', top: '-8px', right: '-8px', 
                  width: '28px', height: '28px', borderRadius: '50%', 
                  backgroundColor: 'var(--proto-red)', color: '#fff', 
                  fontSize: '14px', fontWeight: '800', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(225, 29, 72, 0.4)'
                }}>{num}</span>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px', fontFamily: 'Outfit' }}>{title}</h3>
              <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{detail}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)', fontWeight: '500', marginTop: '48px' }}>
          Questions? Contact our trade support team for assistance with your application.
        </p>
      </div>
    </section>
  );
}

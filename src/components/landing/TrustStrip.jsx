import { ShieldCheck, Mail, Truck, Store, MessageSquare } from 'lucide-react';

const items = [
  { 
    Icon: ShieldCheck, 
    label: 'Trade Customers Only', 
    detail: 'Exclusively supplying registered retailers.' 
  },
  { 
    Icon: Mail,        
    label: 'Direct Ordering',      
    detail: 'Simple, direct B2B ordering portal.' 
  },
  { 
    Icon: Truck,       
    label: 'Nationwide Fulfilment',  
    detail: 'Fast delivery across all major regions.' 
  },
  { 
    Icon: Store,       
    label: 'Built for Retailers',  
    detail: 'Designed for professional trade buyers.' 
  },
  { 
    Icon: MessageSquare, 
    label: 'Priority Support',       
    detail: 'Direct access to our trade experts.' 
  },
];

export default function TrustStrip() {
  return (
    <section className="section-padding" style={{ 
      backgroundColor: '#fff', 
      borderBottom: '1px solid var(--border-light)',
      padding: '48px 0'
    }}>
      <div className="container">
        <div className="grid-5" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '32px'
        }}>
          {items.map(({ Icon, label, detail }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                backgroundColor: 'var(--proto-red-light)', 
                marginBottom: '16px' 
              }}>
                <Icon size={20} color="var(--proto-red)" />
              </div>
              <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', fontFamily: 'Outfit' }}>{label}</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{detail}</p>
            </div>
          ))}
        </div>
        
        <div style={{ 
          textAlign: 'center', 
          marginTop: '40px', 
          paddingTop: '24px', 
          borderTop: '1px solid var(--border-light)'
        }}>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--text-secondary)', 
            fontWeight: '600', 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <ShieldCheck size={16} color="var(--proto-red)" />
            Proto Trading is a B2B wholesaler and does not sell to the general public.
          </p>
        </div>
      </div>
    </section>
  );
}

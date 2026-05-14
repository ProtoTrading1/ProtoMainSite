import { ShieldCheck, Layers, Mail, TrendingUp } from 'lucide-react';

const props = [
  { 
    Icon: ShieldCheck, 
    title: '35+ Years of Trust',  
    body: 'Supplying South African retailers since 1987. A proven, stable partner for your wholesale growth.' 
  },
  { 
    Icon: Layers,      
    title: '5,000+ Active SKUs',       
    body: 'Consolidate your inventory sourcing across 12 diverse categories. One supplier for all your retail needs.' 
  },
  { 
    Icon: Mail,        
    title: 'Direct B2B Portal',            
    body: 'Streamlined ordering process. Browse our digital catalogue and submit orders directly via our portal.' 
  },
  { 
    Icon: TrendingUp,  
    title: 'Retail Optimization',                
    body: 'Our inventory is specifically curated for high retail turnover, ensuring maximum profitability for your store.' 
  },
];

export default function ValueProp() {
  return (
    <section id="value-prop" className="section-padding" style={{ backgroundColor: 'var(--bg-main)' }}>
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
            The Proto Advantage
          </h2>
          <p style={{ 
            fontSize: '18px', 
            color: 'var(--text-secondary)', 
            maxWidth: '640px', 
            margin: '0 auto', 
            lineHeight: 1.7,
            fontWeight: '500'
          }}>
            Why leading retailers choose Proto Trading as their primary wholesale partner.
          </p>
        </div>

        <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
          {props.map(({ Icon, title, body }) => (
            <div key={title} className="category-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="category-icon-wrapper">
                <Icon size={24} color="var(--proto-red)" />
              </div>
              <h3 style={{ 
                fontSize: '18px', 
                fontWeight: '700', 
                color: 'var(--text-primary)', 
                marginBottom: '12px',
                fontFamily: 'Outfit'
              }}>{title}</h3>
              <p style={{ 
                fontSize: '15px', 
                color: 'var(--text-secondary)', 
                lineHeight: 1.6, 
                flexGrow: 1 
              }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

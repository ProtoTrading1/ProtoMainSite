import { Lock } from 'lucide-react';

const products = [
  { name: 'Ladies Bag | Black',                     cat: 'Bags & Luggage',   img: '/bag_black.png' },
  { name: 'Ladies Bag | Cream',                     cat: 'Bags & Luggage',   img: '/bag_cream.png' },
  { name: 'Czech Beads | White & Red | Size 8/0',   cat: 'Beads & Jewellery',img: '/beads_redwhite.png' },
  { name: 'Wood Painted Beads | 6mm Red',           cat: 'Beads & Jewellery',img: '/beads_woodred.png' },
  { name: 'Stationery Supplies | Assorted',          cat: 'Stationery',       img: '/stationery_showcase.png' },
  { name: 'Children\'s Toy Set | Assorted',           cat: 'Toys & Novelty',   img: '/toys_showcase.png' },
];

export default function ProductShowcase() {
  return (
    <section className="section-padding" style={{ backgroundColor: '#fff', borderTop: '1px solid var(--border-light)' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ 
            fontSize: 'clamp(32px, 4vw, 42px)', 
            fontWeight: '800', 
            color: 'var(--text-primary)', 
            letterSpacing: '-1px', 
            marginBottom: '12px',
            fontFamily: 'Outfit'
          }}>
            Curated Product Showcase
          </h2>
          <p style={{ 
            fontSize: '18px', 
            color: 'var(--text-secondary)', 
            fontWeight: '500'
          }}>
            A glimpse into our high-volume inventory lines.
          </p>
        </div>

        <div className="grid-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
          {products.map((p, i) => (
            <div key={i} className="category-card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ height: '180px', backgroundColor: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <img src={p.img} alt={p.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ 
                  fontSize: '10px', fontWeight: '800', color: 'var(--proto-red)', 
                  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' 
                }}>{p.cat}</div>
                <h3 style={{ 
                  fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', 
                  lineHeight: 1.4, marginBottom: '12px', minHeight: '40px',
                  fontFamily: 'Outfit'
                }}>{p.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                  <Lock size={12} /> <span style={{ textTransform: 'uppercase' }}>Sign in for Pricing</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div style={{ textAlign: 'center', marginTop: '48px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '500' }}>
            Full catalogue and wholesale pricing available upon trade account approval.
          </p>
        </div>
      </div>
    </section>
  );
}

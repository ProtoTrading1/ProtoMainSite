import { ArrowRight } from 'lucide-react';

export default function TradeAccessCTA({ onApply }) {
  return (
    <section className="section-padding" style={{
      backgroundColor: 'var(--bg-surface)', textAlign: 'center', position: 'relative', overflow: 'hidden'
    }}>
      <div className="container" style={{ position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={{ 
            fontSize: 'clamp(36px, 5vw, 56px)', 
            fontWeight: '900', 
            color: '#fff', 
            letterSpacing: '-2px', 
            marginBottom: '20px',
            fontFamily: 'Outfit',
            lineHeight: 1.1
          }}>
            Scale Your Retail Business <br />
            <span className="text-red">With Proto Trading</span>
          </h2>
          <p style={{ 
            fontSize: '19px', 
            color: 'var(--text-white-muted)', 
            lineHeight: 1.7, 
            marginBottom: '48px',
            fontWeight: '500'
          }}>
            Apply for trade access today and join South Africa's most trusted professional wholesale network. Immediate access to live pricing and bulk ordering upon approval.
          </p>
          <div className="hero-btns" style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' }}>
            <button onClick={onApply} className="btn-premium" style={{ padding: '18px 48px', fontSize: '17px' }}>
              Apply for Trade Access <ArrowRight size={20} />
            </button>
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="btn-outline" style={{ padding: '18px 48px', fontSize: '17px' }}>
              View Product Range
            </button>
          </div>
          <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.3)', fontWeight: '600', letterSpacing: '0.5px' }}>
            B2B ONLY · VERIFICATION REQUIRED · EST. 1987
          </p>
        </div>
      </div>

      {/* Decorative elements */}
      <div style={{
        position: 'absolute', bottom: '-10%', left: '10%', width: '300px', height: '300px',
        background: 'var(--proto-red)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%', zIndex: 1
      }} />
      <div style={{
        position: 'absolute', top: '-10%', right: '10%', width: '300px', height: '300px',
        background: 'var(--proto-red)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%', zIndex: 1
      }} />
    </section>
  );
}

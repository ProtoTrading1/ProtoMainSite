import React from 'react';
import { ArrowRight, Calendar, Package, LayoutGrid } from 'lucide-react';

export default function Hero({ onLogin, onApply }) {
  return (
    <section className="landing-hero animate-fade" style={{ 
      minHeight: '900px', 
      display: 'flex', 
      alignItems: 'center', 
      paddingTop: '80px',
      background: 'radial-gradient(circle at 70% 30%, #1e1b4b 0%, #050505 70%)'
    }}>
      <div className="container" style={{ 
        position: 'relative', 
        zIndex: 10, 
        width: '100%', 
        maxWidth: '1440px', // Expansive world-class width
        display: 'flex',
        alignItems: 'center'
      }}>
        <div style={{ maxWidth: '800px', width: '100%' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            padding: '8px 20px', borderRadius: '999px', marginBottom: '40px',
            background: 'rgba(225, 29, 72, 0.08)', border: '1px solid rgba(225, 29, 72, 0.2)',
            backdropFilter: 'blur(4px)'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--proto-red)', boxShadow: '0 0 10px var(--proto-red)' }} />
            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--proto-red)', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'Outfit' }}>
              Exclusive Trade Access · B2B Wholesale
            </span>
          </div>

          <h1 style={{ 
            fontSize: 'clamp(56px, 8vw, 84px)', 
            fontWeight: '900', 
            lineHeight: 0.95, 
            letterSpacing: '-3px', 
            marginBottom: '32px',
            color: '#fff',
            fontFamily: 'Outfit'
          }}>
            Wholesale Products <br />
            <span className="text-red" style={{ textShadow: '0 0 40px rgba(225, 29, 72, 0.2)' }}>For The Trade Only</span>
          </h1>

          <p style={{ 
            fontSize: '22px', 
            color: 'var(--text-white-muted)', 
            lineHeight: 1.6, 
            marginBottom: '56px', 
            maxWidth: '600px',
            fontWeight: '500',
            letterSpacing: '-0.2px'
          }}>
            Proto Trading provides verified retailers with immediate access to over 5,000 high-volume product lines across 12 core categories.
          </p>

          <div className="hero-btns" style={{ display: 'flex', gap: '20px', marginBottom: '32px', flexWrap: 'wrap' }}>
            <button onClick={onApply} className="btn-premium" style={{ padding: '20px 48px', fontSize: '18px', borderRadius: '12px' }}>
              Apply for Trade Access <ArrowRight size={22} />
            </button>
            <button onClick={onLogin} className="btn-outline" style={{ padding: '20px 48px', fontSize: '18px', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.1)' }}>
              Log In to Portal
            </button>
          </div>

          <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.3)', fontWeight: '600', letterSpacing: '0.5px' }}>
            * BUSINESS VERIFICATION REQUIRED · EST. 1987
          </p>
        </div>
      </div>

      {/* Hero image background - perfectly balanced */}
      <div className="hero-image" style={{
        position: 'absolute', right: '0%', top: '50%', transform: 'translateY(-50%)',
        width: '48%', maxWidth: '900px', zIndex: 5, opacity: 0.95,
        maskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)'
      }}>
        <img src="/hero_custom.png" alt="Wholesale products" style={{ width: '100%', objectFit: 'contain' }} />
      </div>

      {/* Decorative ambient lights */}
      <div style={{
        position: 'absolute', top: '-10%', right: '5%', width: '500px', height: '500px',
        background: 'var(--proto-red)', opacity: 0.1, filter: 'blur(180px)', borderRadius: '50%', zIndex: 1
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', left: '-5%', width: '400px', height: '400px',
        background: '#1e1b4b', opacity: 0.2, filter: 'blur(150px)', borderRadius: '50%', zIndex: 1
      }} />

      {/* Stats bar */}
      <div className="hero-stats-container" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        padding: '40px 0', background: 'rgba(255, 255, 255, 0.02)', borderTop: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        <div className="container" style={{ maxWidth: '1440px' }}>
          <div className="hero-stats-grid" style={{ display: 'flex', justifyContent: 'space-between', gap: '40px', flexWrap: 'wrap' }}>
            {[
              { Icon: Calendar, val: 'Since 1987', label: 'Legacy of Trade Trust' },
              { Icon: Package, val: '5,000+ SKUs', label: 'High-Volume Inventory' },
              { Icon: LayoutGrid, val: '12 Categories', label: 'Strategic Product Mix' },
            ].map(({ Icon, val, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ 
                  width: '56px', height: '56px', borderRadius: '14px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  flexShrink: 0 
                }}>
                  <Icon size={26} color="var(--proto-red)" />
                </div>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px', fontFamily: 'Outfit' }}>{val}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.4)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}





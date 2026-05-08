import React from 'react';

export default function LandingFooter() {
  return (
    <footer className="landing-footer" style={{ backgroundColor: 'var(--bg-surface)', borderTop: '1px solid var(--border-dark)', padding: '80px 0 40px' }}>
      <div className="container">
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '64px', marginBottom: '64px' }}>
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ 
                width: '36px', height: '36px', borderRadius: '8px', 
                background: 'linear-gradient(135deg, var(--proto-red) 0%, var(--proto-red-dark) 100%)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                fontWeight: '900', fontSize: '18px', color: '#fff' 
              }}>P</div>
              <div>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#fff', fontFamily: 'Outfit' }}>PROTO </span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--proto-red)', fontFamily: 'Outfit' }}>TRADING</span>
              </div>
            </div>
            <p style={{ fontSize: '15px', color: 'var(--text-white-muted)', lineHeight: 1.7, maxWidth: '360px' }}>
              Premier wholesale supplier to the trade since 1987. Supplying verified retailers and resellers with high-volume product lines across South Africa.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '24px', fontFamily: 'Outfit' }}>Quick Links</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {['Home', 'Apply for Access', 'Portal Login', 'Contact Us'].map(link => (
                <a key={link} href="#" style={{ fontSize: '14px', color: 'var(--text-white-muted)', transition: 'color 0.2s ease' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-white-muted)'}
                >{link}</a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '24px', fontFamily: 'Outfit' }}>Trade Support</h4>
            <a href="mailto:orders@prototrading.co.za" style={{ fontSize: '15px', color: 'var(--proto-red)', fontWeight: '700' }}>orders@prototrading.co.za</a>
            <p style={{ fontSize: '14px', color: 'var(--text-white-muted)', marginTop: '16px', lineHeight: 1.6 }}>
              Mon - Fri: 08:30 - 17:00<br />
              Cape Town, South Africa
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.3)', fontWeight: '500' }}>© 2025 Proto Trading. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '24px' }}>
            {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map(item => (
              <span key={item} style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.3)', cursor: 'pointer' }}>{item}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

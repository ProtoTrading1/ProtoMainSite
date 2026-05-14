
export default function LandingHeader({ onLogin, onApply }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="landing-header">
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{ 
            width: '40px', height: '40px', borderRadius: '10px', 
            background: 'linear-gradient(135deg, var(--proto-red) 0%, var(--proto-red-dark) 100%)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontWeight: '900', fontSize: '20px', color: '#fff', 
            boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)'
          }}>P</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '20px', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px', fontFamily: 'Outfit' }}>PROTO</span>
              <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--proto-red)', letterSpacing: '-0.5px', marginLeft: '4px', fontFamily: 'Outfit' }}>TRADING</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-white-muted)', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Wholesale Supplier · Est. 1987</div>
          </div>
        </div>

        <nav className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {[
            { label: 'About', id: 'value-prop' },
            { label: 'Categories', id: 'categories' },
            { label: 'How It Works', id: 'how-it-works' },
            { label: 'Contact', id: 'contact' },
          ].map(({ label, id }) => (
            <button key={id} onClick={() => scrollTo(id)}
              style={{ 
                fontSize: '14px', fontWeight: '600', color: 'var(--text-white-muted)', 
                transition: 'color 0.2s ease', fontFamily: 'Inter' 
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-white-muted)'}
            >{label}</button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onLogin} className="btn-outline" style={{ padding: '8px 20px', fontSize: '14px' }}>Log In</button>
          <button onClick={onApply} className="btn-premium" style={{ padding: '8px 20px', fontSize: '14px' }}>Apply Access</button>
        </div>
      </div>
    </header>
  );
}


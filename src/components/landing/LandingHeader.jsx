import ProtoLogo from '../ProtoLogo';

export default function LandingHeader({ onLogin, onApply }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="landing-header">
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <ProtoLogo variant="full" size="lg" tagline={false} />
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
          <button onClick={onLogin} className="btn-outline" style={{ padding: '8px 20px', fontSize: '14px' }}>Sign In</button>
          <button onClick={onApply} className="btn-premium" style={{ padding: '8px 20px', fontSize: '14px' }}>Apply Access</button>
        </div>
      </div>
    </header>
  );
}

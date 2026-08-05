import { CheckCircle2, Clock3, Mail, ShieldCheck } from 'lucide-react';

const panelStyle = {
  width: 'min(100%, 520px)',
  padding: '32px 28px',
  border: '1px solid rgba(148,163,184,.18)',
  borderRadius: '20px',
  background: 'linear-gradient(145deg, #111827, #080b12)',
  boxShadow: '0 20px 60px rgba(0,0,0,.28)',
};

export default function AccountReviewStatus({ status = 'pending', onLogout, onOpenPortal }) {
  const approved = status === 'approved';
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#050505', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      <section style={panelStyle} aria-labelledby="account-status-title">
        <div style={{ display: 'grid', placeItems: 'center', width: 56, height: 56, marginBottom: 18, borderRadius: '50%', background: approved ? 'rgba(34,197,94,.13)' : 'rgba(234,179,8,.13)', color: approved ? '#4ade80' : '#facc15' }}>
          {approved ? <CheckCircle2 size={30} /> : <Clock3 size={30} />}
        </div>
        <p style={{ margin: '0 0 7px', color: '#d5ad57', fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>PROTO ONLINE ACCESS</p>
        <h1 id="account-status-title" style={{ margin: '0 0 12px', fontSize: 26, lineHeight: 1.15, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
          {approved ? 'Your application is approved' : 'Your application is being reviewed'}
        </h1>
        <p style={{ margin: '0 0 22px', color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
          {approved
            ? 'Your trade access has been approved. You can continue to the online catalogue when your access is ready.'
            : 'Thanks — we have received your application. Proto reviews applications within one business day and will contact you when a decision is ready.'}
        </p>
        <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
          {[['Application received', true], ['Trade details reviewed', approved], ['Online access ready', approved]].map(([label, complete], index) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, color: complete ? '#f8fafc' : '#94a3b8', fontSize: 13 }}>
              {complete ? <CheckCircle2 size={17} color="#4ade80" /> : index === 1 ? <ShieldCheck size={17} color="#64748b" /> : <Clock3 size={17} color="#64748b" />}
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {approved && onOpenPortal && <button type="button" onClick={onOpenPortal} style={{ minHeight: 44, padding: '0 18px', border: 0, borderRadius: 10, background: '#8b1a1a', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Open Proto Online</button>}
          <a href="mailto:online@proto.co.za" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 14px', border: '1px solid rgba(148,163,184,.28)', borderRadius: 10, color: '#e2e8f0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Mail size={15} /> Contact Proto</a>
          <button type="button" onClick={onLogout} style={{ minHeight: 44, padding: '0 14px', border: 0, background: 'transparent', color: '#94a3b8', fontWeight: 700, cursor: 'pointer' }}>Sign out</button>
        </div>
      </section>
    </main>
  );
}

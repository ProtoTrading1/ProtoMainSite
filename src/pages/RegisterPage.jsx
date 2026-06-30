import { useState } from 'react';
import { Lock, ShieldCheck, Package, Users, Truck } from 'lucide-react';
import Questionnaire from '../components/Questionnaire';
import '../landing.css';
import './RegisterPage.css';

const BENEFITS = [
  { Icon: Package, text: '5,000+ wholesale product lines across 12 departments' },
  { Icon: Users, text: 'B2B trade pricing — not available to the general public' },
  { Icon: Truck, text: 'Nationwide delivery support across South Africa' },
];

export default function RegisterPage({ onLogin }) {
  const [done, setDone] = useState(false);

  return (
    <div className="reg-page">
      {/* ── Header ── */}
      <header className="reg-header">
        <div className="reg-header-brand">
          <img src="/proto-logo.webp" alt="Proto Trading" />
          <div>
            <strong>PROTO <span>TRADING</span></strong>
            <small>Wholesale supplier since 1987</small>
          </div>
        </div>
        <button className="reg-header-login" onClick={onLogin}>
          <Lock size={14} />
          Existing customer login
        </button>
      </header>

      {/* ── Main split ── */}
      <main className="reg-main">

        {/* LEFT — invitation panel */}
        <section className="reg-left">
          <div className="reg-left-inner">
            <div className="reg-invite-tag">Your Exclusive Invitation</div>

            <h1 className="reg-headline">
              Complete your<br />
              <span>trade account.</span>
            </h1>

            <p className="reg-subline">
              Be ready to order on day one. Fill in your details below to apply for wholesale trade access to Proto Trading's full catalogue.
            </p>

            {/* Email banner image */}
            <div className="reg-banner-card">
              <img
                src="/proto-register-banner.jpg"
                alt="Proto Trading — Your Exclusive Invitation"
                className="reg-banner-img"
                fetchPriority="high"
                decoding="async"
              />
              <div className="reg-banner-shine" />
            </div>

            {/* Benefits */}
            <ul className="reg-benefits">
              {BENEFITS.map(({ Icon, text }) => (
                <li key={text}>
                  <span className="reg-benefit-icon"><Icon size={15} /></span>
                  {text}
                </li>
              ))}
            </ul>

            <div className="reg-trust">
              <ShieldCheck size={15} />
              <span>B2B trade accounts — admin reviewed &amp; approved</span>
            </div>
          </div>
        </section>

        {/* RIGHT — registration form */}
        <section className="reg-right">
          <div className="reg-form-card">
            <div className="reg-form-header">
              <h2>Create your account</h2>
              <p>Approved accounts get instant access to pricing and the order builder.</p>
            </div>
            <Questionnaire onLogin={onLogin} />
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="reg-footer">
        <span>© {new Date().getFullYear()} Proto Trading. Trade access only — not open to the general public.</span>
        <button onClick={onLogin} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          Already approved? Log in
        </button>
      </footer>
    </div>
  );
}

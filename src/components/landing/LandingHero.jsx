import { ArrowDown, CheckCircle2 } from 'lucide-react';

// One fixed launch message, not the old rotating set: during the re-register
// campaign the subtext has a job to do, and a line that changes every 9
// seconds cannot do it. Set like the campaign banner — uppercase and bold,
// with the action itself in red.
const SUPPORT_LINES = [
  ['Previous online customers must ', 're-register', '.'],
  ['New customers can apply for ', 'online access', '.'],
];

// Sets expectations before anyone applies: an online account is not an account
// at the physical store. Quieter than the lines above — it qualifies them, it
// does not compete with them.
const APPROVAL_NOTE = 'Online approval is for purchasing on Proto Trading Online only. '
  + 'It does not create an account at our physical store.';

export default function LandingHero({ onApply }) {
  return (
    <section className="vhero-section vhero-section--static vhero-section--banner">
      <img
        src="/proto-banner.jpg"
        alt="Proto Trading Online wholesale showroom"
        className="vhero-banner-img"
        fetchPriority="high"
        decoding="async"
      />
      <div className="vhero-banner-scrim" />
      <div className="vhero-copy">
        <h1 className="vhero-headline" aria-label="Welcome to our new online store">
          <span className="vhero-headline-line">WELCOME TO</span>
          <span className="vhero-headline-line">OUR NEW</span>
          <span className="vhero-headline-line vhero-headline-line--accent">ONLINE STORE</span>
        </h1>
        <div className="vhero-support-wrap">
          {SUPPORT_LINES.map(([lead, accent, tail]) => (
            <p key={accent} className="vhero-support-message">
              {lead}
              <strong>{accent}</strong>
              {tail}
            </p>
          ))}
          <p className="vhero-support-note">{APPROVAL_NOTE}</p>
        </div>
        <div className="access-hero-buttons">
          <button className="access-apply large" type="button" onClick={onApply}>
            Apply for a Trade Account <ArrowDown size={18} />
          </button>
        </div>
        <div className="vhero-trust-strip" role="list" aria-label="Wholesale platform highlights">
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>5,000+ PRODUCTS</strong>
              <span>One supplier for your business.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>REAL-TIME STOCK</strong>
              <span>Live inventory, always up to date.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>EXCLUSIVE TRADE PRICING</strong>
              <span>Wholesale pricing for approved customers.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>FAST REORDERING</strong>
              <span>Buy your favourites again in seconds.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

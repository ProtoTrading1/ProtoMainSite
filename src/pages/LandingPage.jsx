import { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Lock,
  Mail,
  MapPin,
  PackageSearch,
  Phone,
  User,
} from 'lucide-react';
import '../landing.css';

const departments = [
  'Packaging',
  'Stationery',
  'Bags & Wallets',
  'Toys',
  'Crafts',
  'Jewellery',
  'Homeware',
  'Seasonal',
];

const proofPoints = [
  { label: 'wholesale product lines to browse', value: '5,000+' },
  { label: 'core buying departments', value: '12' },
  { label: 'established wholesale supplier', value: 'Since 1987' },
  { label: 'delivery support across South Africa', value: 'Nationwide' },
];

const unlocks = [
  { label: 'Trade catalogue', detail: 'Images, codes and departments' },
  { label: 'Order builder', detail: 'Quantities, totals and quote flow' },
  { label: 'PDF requests', detail: 'Product images included' },
];

const showcaseProducts = [
  { code: 'MA002-3', name: 'Paperclips 50mm', dept: 'Stationery', image: '/product-images/MA002-3.webp' },
  { code: 'MA005-11', name: 'Office essentials', dept: 'Stationery', image: '/product-images/MA005-11.webp' },
  { code: 'MA024-6', name: 'Retail craft line', dept: 'Crafts', image: '/product-images/MA024-6.webp' },
  { code: 'MB001-3', name: 'Bead replenishment', dept: 'Jewellery', image: '/product-images/MB001-3.webp' },
  { code: 'PK-992', name: 'Retail packaging', dept: 'Packaging', image: '/campaign-hero-v2.png' },
  { code: '8616-RED', name: 'Craft beads', dept: 'Crafts', image: '/beads_woodred.png' },
];

const heroProducts = showcaseProducts.slice(0, 4);

export default function LandingPage({ onLogin, onApply }) {
  const [submitted, setSubmitted] = useState(false);

  const submitApplication = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  const scrollToForm = () => {
    if (onApply) {
      onApply();
      return;
    }
    document.getElementById('trade-access-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="access-page">
      <header className="access-header">
        <div className="access-brand">
          <img src="/proto-logo.png" alt="Proto Trading" />
          <div>
            <strong>PROTO <span>TRADING</span></strong>
            <small>Wholesale supplier since 1987</small>
          </div>
        </div>
        <nav className="access-nav" aria-label="Public site navigation">
          <button type="button" onClick={() => document.getElementById('departments')?.scrollIntoView({ behavior: 'smooth' })}>Departments</button>
          <button type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
          <button type="button" onClick={() => document.getElementById('trade-access-form')?.scrollIntoView({ behavior: 'smooth' })}>Apply</button>
        </nav>
        <div className="access-actions">
          <button className="access-login" type="button" onClick={onLogin}>
            <Lock size={16} />
            Log in
          </button>
          <button className="access-apply" type="button" onClick={scrollToForm}>
            Apply for access
          </button>
        </div>
      </header>

      <main>
        <section className="access-hero premium-hero">
          <div className="access-hero-copy">
            <div className="access-kicker">
              <span />
              Retailers, resellers and trade buyers
            </div>
            <h1>Unlock Proto Trading’s private wholesale catalogue.</h1>
            <p>
              See product images, catalogue codes and department ranges before you request a quote. Trade pricing and stock checks stay reserved for approved customers.
            </p>
            <div className="access-hero-buttons">
              <button className="access-apply large" type="button" onClick={scrollToForm}>
                Apply for trade access
                <ArrowRight size={18} />
              </button>
              <button className="access-login large" type="button" onClick={onLogin}>
                Existing customer login
              </button>
            </div>
            <div className="access-note">
              Applications are reviewed for genuine trade customers. Public retail sales are not available.
            </div>
            <div className="hero-mini-proof">
              <span>Established wholesale supplier</span>
              <strong>Since 1987</strong>
              <span>Nationwide trade support</span>
            </div>
          </div>

          <div className="premium-product-wall" aria-label="Catalogue preview">
            <div className="wall-header">
              <div>
                <span>Catalogue preview</span>
                <strong>Real products. Trade access required.</strong>
              </div>
              <div className="locked-price-pill">
                <Lock size={14} />
                Pricing locked
              </div>
            </div>
            <div className="wall-grid">
              {heroProducts.map((product) => (
                <article className="hero-product-card" key={product.code}>
                  <div className="hero-product-image">
                    <img src={product.image} alt={product.name} />
                  </div>
                  <div>
                    <small>{product.dept}</small>
                    <strong>{product.name}</strong>
                    <span>{product.code}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="wall-footer">
              {unlocks.map((item) => (
                <div key={item.label}>
                  <PackageSearch size={16} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="proof-strip">
          {proofPoints.map((item) => (
            <div key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </section>

        <section className="access-form-section" id="trade-access-form">
          <div className="form-copy">
            <span>Apply for access</span>
            <h2>Get access to the buying tools behind the portal.</h2>
            <p>
              Send your details once. Once approved, you can browse the catalogue, build quote requests and include product images in PDF order sheets.
            </p>
            <div className="approval-note">
              <Clock3 size={18} />
              <span>Complete trade applications can usually be reviewed within 1 business day.</span>
            </div>
            <ul>
              <li><CheckCircle2 size={17} /> Trade-only access for retailers and resellers</li>
              <li><CheckCircle2 size={17} /> Catalogue browsing by department, code and product</li>
              <li><CheckCircle2 size={17} /> Quote requests with product images and quantities</li>
            </ul>
          </div>

          <div className="access-form-card">
            {submitted ? (
              <div className="success-panel">
                <CheckCircle2 size={46} />
                <h3>Application received</h3>
                <p>Thank you. Proto Trading will review the details and contact you about access.</p>
                <button type="button" onClick={onLogin}>Already approved? Log in</button>
              </div>
            ) : (
              <form onSubmit={submitApplication}>
                <label>
                  Business name
                  <span><Building2 size={16} /><input required name="business" placeholder="Registered business name" /></span>
                </label>
                <label>
                  Contact person
                  <span><User size={16} /><input required name="name" placeholder="Full name" /></span>
                </label>
                <label>
                  Email address
                  <span><Mail size={16} /><input required type="email" name="email" placeholder="name@business.co.za" /></span>
                </label>
                <label>
                  Phone number
                  <span><Phone size={16} /><input required type="tel" name="phone" placeholder="+27" /></span>
                </label>
                <label>
                  Business location
                  <span><MapPin size={16} /><input required name="location" placeholder="City / province" /></span>
                </label>
                <label>
                  Business type
                  <select required name="type" defaultValue="">
                    <option value="" disabled>Select business type</option>
                    <option>Retail store</option>
                    <option>Online reseller</option>
                    <option>Wholesaler / distributor</option>
                    <option>Other trade buyer</option>
                  </select>
                </label>
                <button className="access-apply large" type="submit">
                  Submit application
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="compact-departments" id="departments">
          <span>Catalogue departments</span>
          <div>
            {departments.map((department) => (
              <strong key={department}>{department}</strong>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import {
  ArrowRight, ArrowDown, Lock, CheckCircle2, Clock3,
  Building2, Mail, User, Phone, MapPin, Package, Layers,
} from 'lucide-react';
import '../landing.css';

// ── Config ────────────────────────────────────────────────────────────────────

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO numeric IDs for SADC countries
const SADC_IDS = new Set([24, 72, 426, 454, 508, 516, 710, 748, 894, 716, 834, 180]);
// Light up in this order; South Africa (710) last
const HIGHLIGHT_SEQ = [24, 180, 894, 454, 508, 516, 72, 716, 748, 426, 834, 710];

const departments = [
  { name: 'Packaging', emoji: '📦' },
  { name: 'Stationery', emoji: '✏️' },
  { name: 'Bags & Wallets', emoji: '👜' },
  { name: 'Toys', emoji: '🧸' },
  { name: 'Crafts', emoji: '🎨' },
  { name: 'Jewellery', emoji: '💎' },
  { name: 'Homeware', emoji: '🏡' },
  { name: 'Seasonal', emoji: '🌟' },
];

const steps = [
  {
    n: '01',
    title: 'Browse the full catalogue',
    body: 'Search across 8,000+ product lines by department, code, or keyword — real images, trade codes, and live stock status.',
    Icon: Package,
  },
  {
    n: '02',
    title: 'Build your order basket',
    body: 'Add quantities, watch line totals update in real time, and see your running subtotal. No spreadsheets needed.',
    Icon: Layers,
  },
  {
    n: '03',
    title: 'Send one quote request',
    body: 'Submit your basket in a single click. Proto Trading confirms availability, pricing, and delivery by reply — usually the same day.',
    Icon: CheckCircle2,
  },
];

// ── Counter hook ──────────────────────────────────────────────────────────────

function useCountUp(to, from = 0, duration = 2200, active = false) {
  const [count, setCount] = useState(from);
  useEffect(() => {
    if (!active) return;
    setCount(from);
    const t0 = performance.now();
    const range = to - from;
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(from + range * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return count;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ to, from = 0, duration, suffix = '', prefix = '', label, subLabel, delay = 0, active, isText, textVal }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (active) {
      const t = setTimeout(() => setGo(true), delay);
      return () => clearTimeout(t);
    }
    setGo(false);
  }, [active, delay]);

  const count = useCountUp(to, from, duration, go);

  return (
    <motion.div
      className="lp-stat-card"
      initial={{ opacity: 0, y: 28 }}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: 0.55, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="lp-stat-num">
        {isText ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={go ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, ease: 'backOut' }}
          >
            {textVal}
          </motion.span>
        ) : (
          <>{prefix}{count.toLocaleString()}{suffix}</>
        )}
      </div>
      <div className="lp-stat-label">{label}</div>
      {subLabel && <div className="lp-stat-sub">{subLabel}</div>}
    </motion.div>
  );
}

// ── Southern Africa map ───────────────────────────────────────────────────────

function SouthernAfricaMap({ active }) {
  const [lit, setLit] = useState(new Set());

  useEffect(() => {
    if (!active) { setLit(new Set()); return; }
    HIGHLIGHT_SEQ.forEach((id, i) => {
      setTimeout(() => setLit((prev) => new Set([...prev, id])), i * 240);
    });
  }, [active]);

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ center: [26, -18], scale: 460 }}
      width={680}
      height={560}
      style={{ width: '100%', maxWidth: 560, height: 'auto' }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies
            .filter((geo) => SADC_IDS.has(Number(geo.id)))
            .map((geo) => {
              const id = Number(geo.id);
              const isLit = lit.has(id);
              const isSA = id === 710;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isSA && isLit ? '#8B1A1A' : isLit ? '#1e293b' : '#e2e8f0'}
                  stroke="#fff"
                  strokeWidth={0.7}
                  style={{
                    default: { outline: 'none', transition: 'fill 0.5s ease' },
                    hover: { fill: isSA ? '#6b1414' : isLit ? '#0f172a' : '#cbd5e1', outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
        }
      </Geographies>
    </ComposableMap>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LandingPage({ onLogin }) {
  const [submitted, setSubmitted] = useState(false);

  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true, amount: 0.25 });

  const mapRef = useRef(null);
  const mapInView = useInView(mapRef, { once: true, amount: 0.3 });

  const scrollToForm = () =>
    document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="lp-root">

      {/* ── Sticky header ── */}
      <header className="lp-header">
        <div className="lp-brand">
          <img src="/proto-logo.png" alt="Proto Trading" />
          <strong>PROTO <span>TRADING</span></strong>
        </div>
        <nav className="lp-nav">
          <button type="button" onClick={() => document.getElementById('lp-departments')?.scrollIntoView({ behavior: 'smooth' })}>Departments</button>
          <button type="button" onClick={() => document.getElementById('lp-how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
          <button type="button" onClick={scrollToForm}>Apply</button>
        </nav>
        <div className="lp-header-actions">
          <button className="lp-btn-ghost" type="button" onClick={onLogin}>
            <Lock size={14} /> Log in
          </button>
          <button className="lp-btn-red" type="button" onClick={scrollToForm}>
            Apply for access
          </button>
        </div>
      </header>

      {/* ── §1 Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-glow" />
        <div className="lp-hero-glow lp-hero-glow--2" />

        <div className="lp-hero-inner">
          <motion.div className="lp-kicker"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}>
            <span className="lp-kicker-dot" />
            Retailers · Resellers · Trade buyers
          </motion.div>

          <motion.h1 className="lp-headline"
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            South Africa's<br />private wholesale<br /><em>catalogue.</em>
          </motion.h1>

          <motion.p className="lp-hero-sub"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.42 }}>
            Browse 8,000+ product lines, build a quote-ready basket, and send one request
            to the Proto Trading sales team. Approved trade customers only.
          </motion.p>

          <motion.div className="lp-hero-btns"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.56 }}>
            <button className="lp-cta-primary" type="button" onClick={scrollToForm}>
              Apply for trade access <ArrowRight size={18} />
            </button>
            <button className="lp-cta-ghost" type="button" onClick={onLogin}>
              Existing customer login
            </button>
          </motion.div>

          <motion.p className="lp-hero-note"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.78 }}>
            Applications reviewed for genuine trade customers only.
          </motion.p>
        </div>

        <motion.div className="lp-scroll-arrow"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
          <ArrowDown size={22} />
        </motion.div>
      </section>

      {/* ── §2 Stats ── */}
      <section className="lp-stats" ref={statsRef}>
        <div className="lp-stats-grid">
          <StatCard to={8000} from={0} duration={2400} suffix="+" label="wholesale product lines" delay={0} active={statsInView} />
          <StatCard to={12} from={0} duration={1400} label="core buying departments" subLabel="Packaging to Seasonal" delay={180} active={statsInView} />
          <StatCard to={1987} from={2026} duration={2200} label="established wholesale supplier" subLabel="37 years of trade" delay={360} active={statsInView} />
          <StatCard isText textVal="SA-wide" label="delivery support" subLabel="Nationwide trade network" delay={540} active={statsInView} />
        </div>
      </section>

      {/* ── §3 Map ── */}
      <section className="lp-map-wrapper">
        <div className="lp-map" ref={mapRef}>
          <motion.div className="lp-map-copy"
            initial={{ opacity: 0, x: -40 }}
            animate={mapInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <span className="lp-eyebrow">Nationwide reach</span>
            <h2>Delivering across<br />Southern Africa</h2>
            <p>From Johannesburg to Windhoek, Harare to Maputo — Proto Trading serves trade buyers across the region. Watch the network come alive.</p>
            <div className="lp-map-legend">
              <span className="lp-legend-dot lp-legend-dot--sa" />South Africa — primary market
            </div>
            <div className="lp-map-legend">
              <span className="lp-legend-dot" />Regional delivery destinations
            </div>
          </motion.div>

          <motion.div className="lp-map-visual"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={mapInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}>
            <SouthernAfricaMap active={mapInView} />
          </motion.div>
        </div>
      </section>

      {/* ── §4 Departments ── */}
      <section className="lp-departments" id="lp-departments">
        <motion.div className="lp-section-hd"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.55 }}>
          <span className="lp-eyebrow">Trade catalogue</span>
          <h2>12 core buying departments</h2>
          <p>High-volume wholesale lines organised by category — all in one place.</p>
        </motion.div>

        <div className="lp-dept-grid">
          {departments.map((d, i) => (
            <motion.div key={d.name} className="lp-dept-card"
              initial={{ opacity: 0, y: 44, scale: 0.92 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ type: 'spring', bounce: 0.38, duration: 0.72, delay: i * 0.06 }}>
              <span className="lp-dept-emoji">{d.emoji}</span>
              <span className="lp-dept-name">{d.name}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── §5 How it works ── */}
      <section className="lp-how" id="lp-how">
        <motion.div className="lp-section-hd"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.55 }}>
          <span className="lp-eyebrow">Simple process</span>
          <h2>From browse to quote<br />in minutes.</h2>
        </motion.div>

        <div className="lp-steps">
          {steps.map(({ n, title, body, Icon }, i) => (
            <motion.div key={n}
              className={`lp-step${i % 2 === 1 ? ' lp-step--alt' : ''}`}
              initial={{ opacity: 0, x: i % 2 === 0 ? -56 : 56 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}>
              <div className="lp-step-num">{n}</div>
              <div className="lp-step-body">
                <div className="lp-step-icon"><Icon size={26} /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── §6 Apply ── */}
      <section className="lp-apply-wrapper" id="lp-apply">
        <div className="lp-apply">
          <motion.div className="lp-apply-copy"
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}>
            <span className="lp-eyebrow">Apply for access</span>
            <h2>Get the buying tools behind the portal.</h2>
            <p>Send your details once. Once approved, browse the full catalogue, build quote requests, and send orders with product images included.</p>
            <div className="lp-apply-perks">
              {[
                'Trade-only catalogue access',
                'Quote builder with product images',
                'Same-day approval for genuine trade',
              ].map((t) => (
                <div key={t}><CheckCircle2 size={16} />{t}</div>
              ))}
              <div className="lp-apply-perk-note"><Clock3 size={15} />Usually reviewed within 1 business day</div>
            </div>
          </motion.div>

          <motion.div className="lp-apply-card"
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}>
            {submitted ? (
              <div className="lp-success">
                <CheckCircle2 size={52} />
                <h3>Application received</h3>
                <p>Proto Trading will review your details and be in touch shortly.</p>
                <button type="button" onClick={onLogin}>Already approved? Log in →</button>
              </div>
            ) : (
              <form className="lp-form" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                {[
                  { label: 'Business name', name: 'business', Icon: Building2, placeholder: 'Registered business name' },
                  { label: 'Contact person', name: 'name', Icon: User, placeholder: 'Full name' },
                  { label: 'Email address', name: 'email', Icon: Mail, placeholder: 'name@business.co.za', type: 'email' },
                  { label: 'Phone number', name: 'phone', Icon: Phone, placeholder: '+27', type: 'tel' },
                  { label: 'Location', name: 'location', Icon: MapPin, placeholder: 'City / province' },
                ].map(({ label, name, Icon: I, placeholder, type = 'text' }) => (
                  <label key={name}>
                    {label}
                    <span><I size={14} /><input required name={name} type={type} placeholder={placeholder} /></span>
                  </label>
                ))}
                <label>
                  Business type
                  <select required name="type" defaultValue="">
                    <option value="" disabled>Select type</option>
                    <option>Retail store</option>
                    <option>Online reseller</option>
                    <option>Wholesaler / distributor</option>
                    <option>Other trade buyer</option>
                  </select>
                </label>
                <button type="submit" className="lp-submit">
                  Submit application <ArrowRight size={17} />
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src="/proto-logo.png" alt="Proto Trading" />
            <div>
              <strong>PROTO <span>TRADING</span></strong>
              <small>Wholesale supplier since 1987</small>
            </div>
          </div>
          <button className="lp-btn-ghost" type="button" onClick={onLogin}>
            <Lock size={14} /> Log in to the portal
          </button>
        </div>
        <p className="lp-footer-copy">© {new Date().getFullYear()} Proto Trading. Trade pricing confirmed by reply.</p>
      </footer>
    </div>
  );
}

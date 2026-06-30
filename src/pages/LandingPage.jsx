import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import AboutModal from '../components/AboutModal';
import Questionnaire from '../components/Questionnaire';
import { motion, useInView } from 'motion/react';
import {
  ArrowRight,
  ArrowLeft,
  Gem,
  Home,
  Info,
  Lock,
  PackageSearch,
  Palette,
  SprayCan,
  PartyPopper,
  ShoppingBag,
  CupSoda,
  Wrench,
  CookingPot,
  Spool,
  Gamepad2,
} from 'lucide-react';
import '../landing.css';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const SADC_IDS = new Set([24, 72, 426, 454, 508, 516, 710, 748, 894, 716, 834, 180]);
const HIGHLIGHT_SEQ = [24, 180, 894, 454, 508, 516, 72, 716, 748, 426, 834, 710];

const departments = [
  { name: 'Art Supplies and Stationery' },
  { name: 'Beads, Jewellery & Accessories' },
  { name: 'Beauty & Personal Care' },
  { name: 'Events & Parties' },
  { name: 'Fashion & Accessories' },
  { name: 'Food & Drinks' },
  { name: 'Hardware' },
  { name: 'Homeware & Kitchen' },
  { name: 'Motarro' },
  { name: 'Packaging' },
  { name: 'Textiles' },
  { name: 'Toys, Games & Kids' },
];

// Brand logos shown in the endless marquee under the departments grid
const BRANDS = [
  { name: 'dala', src: '/brands/dala.jpg' },
  { name: 'Mötarro', src: '/brands/motarro.jpg' },
  { name: 'STAEDTLER', src: '/brands/staedtler.jpg' },
  { name: 'Vinnic', src: '/brands/vinnic.jpg' },
  { name: 'Conan', src: '/brands/conan.jpg' },
  { name: 'Marlin', src: '/brands/marlin.jpg' },
  { name: 'Waterlily', src: '/brands/waterlily.jpg' },
  { name: 'OYA', src: '/brands/oya.jpg' },
  { name: 'amazcolor', src: '/brands/amazcolor.jpg' },
  { name: 'Keep Smiling', src: '/brands/keepsmiling.jpg' },
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
];

const SADC_COUNTRIES = [
  'South Africa', 'Angola', 'Botswana', 'DRC', 'Eswatini',
  'Lesotho', 'Malawi', 'Mozambique', 'Namibia', 'Tanzania',
  'Zambia', 'Zimbabwe',
];

const SouthernAfricaMap = lazy(() => import('../components/SouthernAfricaMap'));

function CustomerIcon() {
  return (
    <svg width="28" height="30" viewBox="0 0 28 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <circle cx="14" cy="8" r="7" fill="#8B1A1A"/>
      {/* Inner highlight */}
      <circle cx="14" cy="8" r="3.5" fill="#c0392b" opacity="0.6"/>
      {/* Body/shoulders */}
      <path d="M0 30C0 20.611 6.268 14 14 14C21.732 14 28 20.611 28 30Z" fill="#8B1A1A"/>
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="12" width="24" height="15" rx="2" fill="#6B1414" stroke="#8B1A1A" strokeWidth="1.5"/>
      <line x1="2" y1="12" x2="28" y2="12" stroke="#8B1A1A" strokeWidth="2" strokeLinecap="round"/>
      <path d="M3 12L9.5 5H15V12" fill="#4a0f0f" stroke="#8B1A1A" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M27 12L20.5 5H15V12" fill="#4a0f0f" stroke="#8B1A1A" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="15" y1="12" x2="15" y2="27" stroke="#8B1A1A" strokeWidth="1.5" strokeOpacity="0.35"/>
    </svg>
  );
}

function WarehouseIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 13L15 2l14 11" fill="#4a0f0f" stroke="#8B1A1A" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="2" y="13" width="26" height="15" fill="#6B1414" stroke="#8B1A1A" strokeWidth="1.5"/>
      <rect x="5" y="19" width="8" height="9" rx="1" fill="#8B1A1A" opacity="0.75"/>
      <rect x="17" y="19" width="8" height="9" rx="1" fill="#8B1A1A" opacity="0.75"/>
      <line x1="9" y1="19" x2="9" y2="28" stroke="#4a0f0f" strokeWidth="1"/>
      <line x1="21" y1="19" x2="21" y2="28" stroke="#4a0f0f" strokeWidth="1"/>
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="36" height="22" viewBox="0 0 36 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="3" width="13" height="13" rx="2" fill="#8B1A1A"/>
      <rect x="23" y="4.5" width="5" height="6" rx="1" fill="rgba(255,255,255,0.25)"/>
      <rect x="1" y="5" width="22" height="11" rx="1.5" fill="#6B1414"/>
      <rect x="3" y="14" width="29" height="3" rx="1" fill="#4a0f0f"/>
      <rect x="33" y="13" width="2" height="4" rx="1" fill="#8B1A1A"/>
      <circle cx="8" cy="18" r="3.5" fill="#1a1a1a" stroke="#8B1A1A" strokeWidth="1.5"/>
      <circle cx="8" cy="18" r="1.2" fill="#333"/>
      <circle cx="27" cy="18" r="3.5" fill="#1a1a1a" stroke="#8B1A1A" strokeWidth="1.5"/>
      <circle cx="27" cy="18" r="1.2" fill="#333"/>
      <rect x="0" y="7" width="2" height="4" rx="1" fill="#8B1A1A"/>
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Large round head — takes up most of the icon height */}
      <circle cx="15" cy="15" r="15" fill="#8B1A1A"/>
      {/* Short pointed tail — clearly distinct from the circle */}
      <path d="M9 26 L21 26 L15 40 Z" fill="#8B1A1A"/>
      {/* Prominent white ring */}
      <circle cx="15" cy="15" r="7" fill="white"/>
      {/* Red centre dot */}
      <circle cx="15" cy="15" r="3" fill="#8B1A1A"/>
    </svg>
  );
}

const SCROLL_STAGES = [
  { threshold: 0,   Icon: CustomerIcon, transform: 'translate(-50%, -50%)'           },
  { threshold: 0.2, Icon: BoxIcon,      transform: 'translate(-50%, -50%)'           },
  { threshold: 0.4, Icon: WarehouseIcon,transform: 'translate(-50%, -50%)'           },
  { threshold: 0.6, Icon: TruckIcon,    transform: 'translate(-50%, -50%) rotate(90deg)' },
  { threshold: 0.8, Icon: PinIcon,      transform: 'translate(-50%, -100%)'          },
];
const FADE_ZONE = 0.07;

function TruckScrollbar() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [vw, setVw] = useState(() => window.innerWidth);
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    function getTarget() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH <= 0) return null;
      return Math.min(scrollTop / docH, 1);
    }

    function tick() {
      const target = targetRef.current;
      const current = currentRef.current;
      const next = current + (target - current) * 0.07;
      const snapped = Math.abs(next - target) < 0.0005 ? target : next;
      currentRef.current = snapped;
      setProgress(snapped);
      rafRef.current = requestAnimationFrame(tick);
    }

    function onScroll() {
      const t = getTarget();
      if (t === null) { setVisible(false); return; }
      setVisible(true);
      targetRef.current = t;
    }

    function onResize() {
      setVw(window.innerWidth);
      onScroll();
    }

    const t = getTarget();
    if (t !== null) { setVisible(true); targetRef.current = t; }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'hide-native-scrollbar';
    style.textContent = `::-webkit-scrollbar{display:none}*{scrollbar-width:none;-ms-overflow-style:none}`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Responsive sizing
  const isMobile = vw < 640;
  const right    = isMobile ? 5 : 10;
  const PAD      = isMobile ? 18 : 24;
  const dotSize  = isMobile ? 6  : 8;
  const trackW   = isMobile ? 2  : 3;
  const scale    = isMobile ? 0.65 : 1;

  // Which stage are we in?
  let curIdx = 0;
  for (let i = 0; i < SCROLL_STAGES.length; i++) {
    if (progress >= SCROLL_STAGES[i].threshold) curIdx = i;
  }
  const nextIdx = Math.min(curIdx + 1, SCROLL_STAGES.length - 1);
  const nextThresh = SCROLL_STAGES[nextIdx].threshold;
  const blend = curIdx === nextIdx
    ? 0
    : Math.max(0, Math.min(1, (progress - (nextThresh - FADE_ZONE)) / FADE_ZONE));

  const { Icon: CurIcon, transform: curTransform } = SCROLL_STAGES[curIdx];
  const { Icon: NxtIcon, transform: nxtTransform } = SCROLL_STAGES[nextIdx];

  const trackH = window.innerHeight - PAD * 2 - 40;
  const thumbTop = PAD + progress * trackH;

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', right, top: 0, height: '100vh', width: isMobile ? 32 : 48, zIndex: 9999, pointerEvents: 'none' }}>
      {/* Track */}
      <div style={{ position: 'absolute', top: PAD, bottom: PAD, left: '50%', transform: 'translateX(-50%)', width: trackW, background: '#111', borderRadius: '2px' }}>
        {/* Progress fill */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${progress * 100}%`, background: 'linear-gradient(to bottom, #8B1A1A, #c0392b)', borderRadius: '2px' }} />
        {/* Stage waypoint dots */}
        {[0.2, 0.4, 0.6, 0.8].map(p => {
          const passed = progress >= p - 0.01;
          return (
            <div key={p} style={{
              position: 'absolute',
              top: `${p * 100}%`,
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: dotSize, height: dotSize,
              borderRadius: '50%',
              background: passed ? '#8B1A1A' : '#1e1e1e',
              border: `1.5px solid ${passed ? '#c0392b' : '#2a2a2a'}`,
              boxShadow: passed ? '0 0 5px rgba(139,26,26,0.55)' : 'none',
              transition: 'background 0.4s, box-shadow 0.4s, border-color 0.4s',
            }} />
          );
        })}
      </div>

      {/* Thumb — crossfade between stage icons.
          Each icon is independently positioned so the drop-shadow
          filter is applied to the actual painted area, not a zero-size box. */}
      <div style={{ position: 'absolute', top: `${thumbTop}px`, left: '50%', width: 0, height: 0 }}>
        <div style={{
          position: 'absolute',
          transform: curTransform,
          opacity: 1 - blend,
          transition: 'opacity 0.35s ease',
          filter: 'drop-shadow(0 2px 8px rgba(139,26,26,0.8))',
          transformOrigin: '0 0',
          ...(isMobile ? { scale: '0.7' } : {}),
        }}>
          <CurIcon />
        </div>
        <div style={{
          position: 'absolute',
          transform: nxtTransform,
          opacity: blend,
          transition: 'opacity 0.35s ease',
          filter: 'drop-shadow(0 2px 8px rgba(139,26,26,0.8))',
          transformOrigin: '0 0',
          ...(isMobile ? { scale: '0.7' } : {}),
        }}>
          <NxtIcon />
        </div>
      </div>

      {/* Start glow dot */}
      <div style={{ position: 'absolute', top: PAD, left: '50%', transform: 'translate(-50%, -50%)', width: dotSize, height: dotSize, borderRadius: '50%', background: '#8B1A1A', boxShadow: '0 0 8px rgba(139,26,26,0.9)' }} />
    </div>
  );
}

function useCountUp(to, from = 0, duration = 1800, active = false) {
  const [val, setVal] = useState(from);
  useEffect(() => {
    if (!active) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * ease));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [active, to, from, duration]);
  return val;
}

function StatCard({ value, suffix = '', label, from = 0, duration = 1800, active }) {
  const num = useCountUp(value, from, duration, active);
  return (
    <div className="lp-stat-card">
      <strong>{num.toLocaleString()}{suffix}</strong>
      <span>{label}</span>
    </div>
  );
}

function DeptCountCard({ name, count, active, delay = 0 }) {
  const num = useCountUp(count, 0, 1400, active);
  return (
    <motion.div
      className="lp-dept-card"
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay }}
    >
      <strong className="lp-dept-count">{num.toLocaleString()}</strong>
      <span className="lp-dept-name">{name}</span>
    </motion.div>
  );
}

// One product per Proto Trading category, arranged into three parallax lanes
// (back → front). The lanes flow left → right as "Proto Trading's world of
// wholesale products in motion". Icons are isolated glyphs — no cards — so the
// same slots can later hold real cutout product renders.
const STREAM_LANES = [
  // Back lane — small, dim, soft-blurred, slowest
  { speed: 38, items: [
    { Icon: SprayCan, label: 'Beauty & Personal Care' },
    { Icon: Wrench, label: 'Hardware' },
    { Icon: Spool, label: 'Textiles' },
    { Icon: Package, label: 'Packaging' },
  ] },
  // Mid lane — medium scale and brightness
  { speed: 30, items: [
    { Icon: CookingPot, label: 'Homeware & Kitchen' },
    { Icon: CupSoda, label: 'Food & Drinks' },
    { Icon: PartyPopper, label: 'Events & Parties' },
    { Icon: Palette, label: 'Art Supplies & Stationery' },
  ] },
  // Front lane — large, sharp, red-lit, fastest
  { speed: 24, items: [
    { Icon: Gem, label: 'Beads, Jewellery & Accessories' },
    { Icon: ShoppingBag, label: 'Fashion & Accessories' },
    { Icon: Gamepad2, label: 'Toys, Games & Kids' },
  ] },
];

function ProductStream() {
  return (
    <div className="vhero-stream" aria-hidden="true">
      <div className="vhero-stream-glow" />
      <div className="vhero-stream-streaks">
        <span style={{ top: '22%', animationDuration: '4.5s' }} />
        <span style={{ top: '47%', animationDuration: '3.2s', animationDelay: '1.1s' }} />
        <span style={{ top: '71%', animationDuration: '5.4s', animationDelay: '0.6s' }} />
      </div>
      {STREAM_LANES.map((lane, li) => (
        <div className={`vhero-lane vhero-lane--${li}`} key={li}>
          <div className="vhero-track" style={{ animationDuration: `${lane.speed}s` }}>
            {[...lane.items, ...lane.items].map(({ Icon, label }, i) => (
              <div className="vhero-item" key={`${label}-${i}`}>
                <Icon strokeWidth={1.4} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoHero({ onLogin, onApply }) {
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
      <div
        className="vhero-copy"
      >
        <h1>
          <span style={{ color: '#fff', display: 'block' }}>Proto Trading</span>
          <span style={{ color: '#dc2626', display: 'block' }}>Online.</span>
        </h1>
        <div className="access-hero-buttons">
          <button className="access-apply large" type="button" onClick={onApply}>
            Apply for trade access <ArrowRight size={18} />
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
          <span>Nationwide trade support</span>
        </div>
      </div>
    </section>
  );
}

const CAT_CARDS = [
  { id: 'cat-1',  label: 'Homeware & Kitchen',            img: '/cat-homeware.jpg' },
  { id: 'cat-2',  label: 'Beads, Jewellery & Accessories', img: '/cat-beads.jpg' },
  { id: 'cat-3',  label: 'Toys, Games & Kids',             img: '/cat-toys.jpg' },
  { id: 'cat-4',  label: 'Arts, Crafts & Stationery',      img: '/cat-arts.jpg' },
  { id: 'cat-5',  label: 'Beauty & Personal Care',         img: '/cat-beauty.jpg' },
  { id: 'cat-6',  label: 'Fashion & Accessories',          img: '/cat-fashion.jpg' },
  { id: 'cat-7',  label: 'Hardware & Tools',               img: '/cat-hardware.jpg' },
  { id: 'cat-8',  label: 'Packaging',                      img: '/cat-packaging.jpg' },
  { id: 'cat-9',  label: 'Textiles & Ribbons',             img: '/cat-textiles.jpg' },
  { id: 'cat-10', label: 'Events & Parties',               img: '/cat-events.jpg' },
  { id: 'cat-11', label: 'Crackers & Seasonal',            img: '/cat-crackers.jpg' },
];

function CategoryCarousel() {
  const [idx, setIdx] = useState(0);
  const total = CAT_CARDS.length;
  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);
  const peekIdx = (idx + 1) % total;

  return (
    <div className="lp-carousel">
      {/* Peek card — sits behind, slightly offset right */}
      <div className="lp-carousel-peek" key={peekIdx}>
        <img src={CAT_CARDS[peekIdx].img} alt="" className="lp-feat-card-bg" />
        <div className="lp-feat-card-overlay" />
      </div>

      {/* Main card */}
      <div className="lp-carousel-main" key={idx}>
        <img src={CAT_CARDS[idx].img} alt={CAT_CARDS[idx].label} className="lp-feat-card-bg" />
        <div className="lp-feat-card-overlay" />
        <div className="lp-feat-card-footer">{CAT_CARDS[idx].label}</div>
      </div>

      {/* Arrows */}
      <button className="lp-carousel-btn lp-carousel-btn--prev" onClick={prev} aria-label="Previous">
        <ArrowLeft size={20} />
      </button>
      <button className="lp-carousel-btn lp-carousel-btn--next" onClick={next} aria-label="Next">
        <ArrowRight size={20} />
      </button>

      {/* Dots */}
      <div className="lp-carousel-dots">
        {CAT_CARDS.map((_, i) => (
          <button key={i} className={`lp-carousel-dot${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)} />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage({ onLogin, onApply }) {
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#000';
    document.documentElement.style.background = '#000';
    return () => {
      document.body.style.background = prev;
      document.documentElement.style.background = '';
    };
  }, []);

  const [showAbout, setShowAbout] = useState(false);
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true, margin: '-80px' });

  const deptRef = useRef(null);
  const deptInView = useInView(deptRef, { once: true, margin: '-80px' });

  const scrollToForm = () => {
    if (onApply) { onApply(); return; }
    document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="access-page">
      {/* ── Original header ── */}
      <header className="access-header">
        <div className="access-brand">
          <img src="/proto-logo.webp" alt="Proto Trading" loading="eager" fetchPriority="high" decoding="async" />
          <div>
            <strong>PROTO <span>TRADING</span></strong>
            <small>Wholesale supplier since 1987</small>
          </div>
        </div>
        <nav className="access-nav" aria-label="Public site navigation">
          <button type="button" onClick={() => document.getElementById('lp-departments')?.scrollIntoView({ behavior: 'smooth' })}>Departments</button>
<button type="button" onClick={() => document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' })}>Apply</button>
          <button type="button" onClick={() => setShowAbout(true)}>About us</button>
          <button type="button" className="access-nav-login" onClick={onLogin}>Log in</button>
        </nav>
      </header>

      <main>
        {/* ── Video hero ── */}
        <VideoHero onLogin={onLogin} onApply={scrollToForm} />

        <div>
        {/* ── Animated stats ── */}
        <section className="lp-stats" ref={statsRef}>
          <StatCard value={5000} suffix="+" label="wholesale product lines" active={statsInView} duration={1600} />
          <StatCard value={12} label="core buying departments" active={statsInView} duration={900} />
          <div className="lp-stat-card lp-stat-text">
            <strong>Nationwide</strong>
            <span>delivery support across South Africa</span>
          </div>
        </section>

        {/* ── Southern Africa map ── */}
        <motion.section
          className="lp-map-wrapper"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <div className="lp-map-copy">
            <span className="lp-eyebrow">Delivery coverage</span>
            <h2>Serving trade buyers across Southern Africa.</h2>
            <p>
              Proto Trading ships to retailers and resellers throughout South Africa and the wider SADC region. One supplier, nationwide reach.
            </p>
          </div>
          <motion.div
            className="lp-map-inner"
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <Suspense fallback={<div style={{ width: '100%', height: '100%' }} />}>
              <SouthernAfricaMap />
            </Suspense>
          </motion.div>
        </motion.section>

        {/* ── Departments ── */}
        <section className="lp-departments" id="lp-departments" ref={deptRef}>
          <motion.div
            className="lp-section-header"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
          >
            <span className="lp-eyebrow">Catalogue departments</span>
            <h2>12 buying departments, 5,000+ products.</h2>
          </motion.div>
          <div className="lp-dept-tags">
            {departments.map((dept) => (
              <span className="lp-dept-tag" key={dept.name}>{dept.name}</span>
            ))}
          </div>
          <ul className="lp-dept-list" role="list">
            {departments.map((dept) => (
              <li key={dept.name}>
                <span className="lp-dept-list-item">{dept.name}</span>
              </li>
            ))}
          </ul>

          {/* ── Brands we work with (endless right-moving marquee) ── */}
          <div className="lp-brands">
            <span className="lp-brands-label">Brands we work with</span>
            <div className="lp-brands-marquee">
              <div className="lp-brands-track">
                {[...BRANDS, ...BRANDS].map((b, i) => (
                  <div className="lp-brand" key={`${b.name}-${i}`} aria-hidden={i >= BRANDS.length}>
                    <img src={b.src} alt={b.name} loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Apply / Questionnaire ── */}
        <section className="lp-apply-wrapper" id="lp-apply">
          <motion.div
            className="lp-apply-copy"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="lp-eyebrow lp-eyebrow-light">Apply for access</span>
            <h2>Get access to Proto Trading's catalogue.</h2>
          </motion.div>

          <motion.div
            className="lp-apply-card"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <Questionnaire onLogin={onLogin} />
          </motion.div>
        </section>

        {/* ── Footer ── */}
        <footer className="lp-footer" style={{ flexWrap: 'wrap', rowGap: '16px' }}>
          <div className="lp-footer-brand">
            <img src="/proto-logo.webp" alt="Proto Trading" />
            <div>
              <strong>PROTO <span>TRADING</span></strong>
              <small>Wholesale supplier since 1987</small>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
            <p style={{ margin: 0 }}>Trade access only. Not open to the general public.</p>
            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Returns Policy', hash: '#/policies/returns' },
                { label: 'Shipping Policy', hash: '#/policies/shipping' },
                { label: 'Terms & Conditions', hash: '#/policies/terms' },
                { label: 'Privacy Policy', hash: '#/policies/privacy' },
              ].map(({ label, hash }) => (
                <a
                  key={hash}
                  href={hash}
                  onClick={(e) => { e.preventDefault(); window.location.hash = hash.slice(1); }}
                  style={{ color: '#475569', fontSize: '12px', fontWeight: 700, textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#475569'; }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
          <button className="access-login" type="button" onClick={onLogin}>
            <Lock size={15} />
            Customer login
          </button>
        </footer>
        </div>{/* end belowHero */}
      </main>
      <TruckScrollbar />
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}

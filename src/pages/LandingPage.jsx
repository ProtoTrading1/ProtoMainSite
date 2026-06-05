import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { motion, useInView } from 'motion/react';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Lock,
  MessageCircle,
  PackageSearch,
} from 'lucide-react';
import '../landing.css';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const SADC_IDS = new Set([24, 72, 426, 454, 508, 516, 710, 748, 894, 716, 834, 180]);
const HIGHLIGHT_SEQ = [24, 180, 894, 454, 508, 516, 72, 716, 748, 426, 834, 710];

const departments = [
  { name: 'Packaging', count: 1840 },
  { name: 'Stationery', count: 2240 },
  { name: 'Bags & Wallets', count: 680 },
  { name: 'Toys', count: 420 },
  { name: 'Crafts', count: 960 },
  { name: 'Jewellery', count: 820 },
  { name: 'Homeware', count: 560 },
  { name: 'Seasonal', count: 380 },
];

const steps = [
  {
    num: '01',
    title: 'Apply for trade access',
    body: 'Fill in your business details once. We review applications for genuine trade customers — retailers, resellers, and distributors.',
  },
  {
    num: '02',
    title: 'Browse the catalogue',
    body: 'Once approved, explore 8,000+ product lines across 12 departments. Filter by department, search by code, or browse freely.',
  },
  {
    num: '03',
    title: 'Build your order',
    body: 'Add quantities, generate a PDF with product images, and submit your quote request. Our team contacts you with trade pricing.',
  },
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

const SA_PROVINCES = [
  'Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape',
  'Limpopo', 'Mpumalanga', 'North West', 'Free State', 'Northern Cape',
];

const BUSINESS_TYPES = [
  'Retail store',
  'Online shop / e-commerce',
  'Wholesaler',
  'Importer / distributor',
  'Craft & hobby shop',
  'Gift & novelty store',
  'Pharmacy / health & beauty',
  'Hardware & home store',
  'Stationery & office supply',
  "Baby & children's store",
  'Fashion & clothing boutique',
  'Dollar / variety store',
  'Market trader / spaza shop',
  'School or institution',
  'Events, parties & décor',
  'Other',
];

const STEP_LABELS = ['Company', 'Contact', 'Addresses', 'Additional'];
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

function Questionnaire({ onLogin }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [phone, setPhone] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(null);
  const [companyAddress, setCompanyAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [country, setCountry] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [otherType, setOtherType] = useState('');
  const canNext = () => {
    if (step === 0) return companyName.trim() && contactName.trim();
    if (step === 1) return email.trim() && username.trim() && phone.trim() && password.trim().length >= 8;
    if (step === 2) return companyAddress.trim() && deliveryAddress.trim();
    if (step === 3) return true;
    return false;
  };

  const advance = async () => {
    if (!canNext()) return;
    if (step < STEP_LABELS.length - 1) {
      setStep(step + 1);
      return;
    }
    // Final step — submit
    setSubmitting(true);
    setSubmitError('');
    try {
      const { submitTradeApplication } = await import('../lib/tradeApplication');
      await submitTradeApplication({
        email: email.trim(),
        username: username.trim(),
        password,
        contactName: contactName.trim(),
        businessName: companyName.trim(),
        phone: phone.trim(),
        companyAddress: companyAddress.trim(),
        deliveryAddress: deliveryAddress.trim(),
        vatNumber: vatNumber.trim() || null,
        country: country || null,
        province: province || null,
        city: city.trim() || null,
        businessType: businessType === 'Other' ? otherType.trim() : businessType || null,
        acceptWhatsapp: whatsappOptIn === true,
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') void advance();
  };

  if (done) {
    return (
      <div className="lp-quiz-success">
        <CheckCircle2 size={48} />
        <h3>Application received</h3>
        <p>Thank you, {contactName}. Proto Trading will review your application and contact you about trade access. Check your email to confirm your address.</p>
        <button type="button" onClick={onLogin}>Already approved? Log in</button>
      </div>
    );
  }

  return (
    <div className="lp-quiz">
      <div className="lp-quiz-progress">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className={`lp-quiz-prog-seg ${i <= step ? 'active' : ''}`} />
        ))}
      </div>
      <p className="lp-quiz-step-label">Step {step + 1} of {STEP_LABELS.length} — {STEP_LABELS[step]}</p>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22 }}
      >
        {step === 0 && (
          <div className="lp-quiz-step">
            <h3>Start with the core company details.</h3>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label>Company name</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Registered company name"
                />
              </div>
              <div className="lp-quiz-field">
                <label>Contact person name and surname</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Full contact name"
                />
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label>VAT number <span style={{ opacity: 0.55, fontWeight: 500 }}>(optional)</span></label>
                <input
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="VAT registration number"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="lp-quiz-step">
            <h3>Add the account and contact details.</h3>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="name@business.co.za"
                />
              </div>
              <div className="lp-quiz-field">
                <label>Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Choose a username"
                />
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label>Phone number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="+27"
                />
              </div>

              {/* WhatsApp opt-in CTA — appears once phone is filled */}
              {phone.replace(/\D/g, '').length >= 8 && (
                <motion.div
                  className="lp-quiz-field lp-quiz-field--full"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div style={{
                    background: 'rgba(22,163,74,0.1)',
                    border: '1px solid rgba(22,163,74,0.35)',
                    borderRadius: '12px',
                    padding: '16px 18px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <MessageCircle size={18} color="#4ade80" style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ color: '#fff', fontWeight: '700', fontSize: '14px' }}>Can we message you on WhatsApp?</div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', marginTop: '2px' }}>Get specials, stock alerts and order updates straight to your phone.</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setWhatsappOptIn(true)}
                        style={{
                          flex: 1, padding: '11px', borderRadius: '8px', border: 'none',
                          fontFamily: 'inherit', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                          background: whatsappOptIn === true ? '#16a34a' : 'rgba(22,163,74,0.2)',
                          color: whatsappOptIn === true ? '#fff' : '#4ade80',
                          transition: 'all 0.15s',
                        }}
                      >
                        ✓ Yes, WhatsApp me
                      </button>
                      <button
                        type="button"
                        onClick={() => setWhatsappOptIn(false)}
                        style={{
                          flex: 1, padding: '11px', borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.15)',
                          fontFamily: 'inherit', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                          background: whatsappOptIn === false ? 'rgba(255,255,255,0.08)' : 'transparent',
                          color: whatsappOptIn === false ? '#fff' : 'rgba(255,255,255,0.45)',
                          transition: 'all 0.15s',
                        }}
                      >
                        No thanks
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="lp-quiz-field lp-quiz-field--full">
                <label>Password <span style={{ opacity: 0.55, fontWeight: 500 }}>(min. 8 characters)</span></label>
                <div className="lp-quiz-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="At least 8 characters"
                  />
                  <button type="button" className="lp-quiz-pw-eye" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="lp-quiz-step">
            <h3>Enter the two addresses we need.</h3>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field lp-quiz-field--full">
                <label>Full company address</label>
                <AddressAutocomplete
                  value={companyAddress}
                  onChange={setCompanyAddress}
                  onKeyDown={handleKey}
                  placeholder="Start typing your street address…"
                />
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label>Full delivery address</label>
                <AddressAutocomplete
                  value={deliveryAddress}
                  onChange={setDeliveryAddress}
                  onKeyDown={handleKey}
                  placeholder="Start typing delivery address…"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="lp-quiz-step">
            <h3>Optional: add any extra business details.</h3>
            <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: '13px', lineHeight: 1.6, margin: '-4px 0 18px' }}>
              These details help the team, but they are not required to submit your trade request.
            </p>
            <div className="lp-quiz-countries">
              {SADC_COUNTRIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`lp-quiz-country${country === c ? ' selected' : ''}`}
                  onClick={() => { setCountry(c); setProvince(''); setCity(''); }}
                >
                  {c}
                </button>
              ))}
            </div>
            {country === 'South Africa' && (
              <motion.div
                className="lp-quiz-sa-fields"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
              >
                <div className="lp-quiz-field">
                  <label>Province</label>
                  <select value={province} onChange={(e) => setProvince(e.target.value)}>
                    <option value="">Select province</option>
                    {SA_PROVINCES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="lp-quiz-field">
                  <label>City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="e.g. Cape Town"
                  />
                </div>
              </motion.div>
            )}
            <div style={{ height: '18px' }} />
            <div className="lp-quiz-types">
              {BUSINESS_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`lp-quiz-type-card${businessType === t ? ' selected' : ''}`}
                  onClick={() => setBusinessType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {businessType === 'Other' && (
              <motion.div
                className="lp-quiz-field lp-quiz-other-field"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label>Describe your business</label>
                <input
                  value={otherType}
                  onChange={(e) => setOtherType(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Tell us what type of business you run"
                />
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      {submitError && (
        <div className="lp-quiz-error">{submitError}</div>
      )}

      <div className="lp-quiz-nav">
        {step > 0 ? (
          <button type="button" className="lp-quiz-back" onClick={() => setStep(step - 1)} disabled={submitting}>
            ← Back
          </button>
        ) : <span />}
        <button
          type="button"
          className="lp-quiz-next"
          disabled={!canNext() || submitting}
          onClick={() => void advance()}
        >
          {submitting ? 'Submitting…' : step < STEP_LABELS.length - 1 ? 'Next' : 'Submit application'}
          {!submitting && step < STEP_LABELS.length - 1 && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function LandingPage({ onLogin, onApply }) {
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true, margin: '-80px' });

  const deptRef = useRef(null);
  const deptInView = useInView(deptRef, { once: true, margin: '-80px' });

  const scrubSectionRef = useRef(null);
  const scrubVideoRef = useRef(null);

  useEffect(() => {
    const section = scrubSectionRef.current;
    const video = scrubVideoRef.current;
    if (!section || !video) return;

    function scrub() {
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      const progress = Math.max(0, Math.min(1, -rect.top / scrollable));
      if (video.readyState >= 2 && video.duration) {
        video.currentTime = progress * video.duration;
      }
    }

    window.addEventListener('scroll', scrub, { passive: true });
    return () => window.removeEventListener('scroll', scrub);
  }, []);

  const scrollToForm = () => {
    if (onApply) { onApply(); return; }
    document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="access-page">
      {/* ── Original header ── */}
      <header className="access-header">
        <div className="access-brand">
          <img src="/proto-logo.png" alt="Proto Trading" loading="eager" fetchPriority="high" decoding="async" />
          <div>
            <strong>PROTO <span>TRADING</span></strong>
            <small>Wholesale supplier since 1987</small>
          </div>
        </div>
        <nav className="access-nav" aria-label="Public site navigation">
          <button type="button" onClick={() => document.getElementById('lp-departments')?.scrollIntoView({ behavior: 'smooth' })}>Departments</button>
          <button type="button" onClick={() => document.getElementById('lp-how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
          <button type="button" onClick={() => document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' })}>Apply</button>
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
        {/* ── Original hero ── */}
        <section className="access-hero premium-hero">
          <div className="access-hero-copy">
            <h1>Unlock Proto Trading's private wholesale catalogue.</h1>
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
              {showcaseProducts.map((product) => (
                <article className="hero-product-card" key={product.code}>
                  <div className="hero-product-image">
                    <img src={product.image} alt={product.name} loading="eager" fetchPriority="high" decoding="async" />
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

        {/* ── Scroll hint ── */}
        <div className="lp-scroll-hint">
          <ArrowDown size={22} />
        </div>

        {/* ── Animated stats ── */}
        <section className="lp-stats" ref={statsRef}>
          <StatCard value={8000} suffix="+" label="wholesale product lines" active={statsInView} duration={1600} />
          <StatCard value={12} label="core buying departments" active={statsInView} duration={900} />
          <StatCard value={1987} from={2026} label="established wholesale supplier" active={statsInView} duration={1800} />
          <div className="lp-stat-card lp-stat-text">
            <strong>Nationwide</strong>
            <span>delivery support across South Africa</span>
          </div>
        </section>

        {/* ── Video scroll scrub ── */}
        <section ref={scrubSectionRef} style={{ position: 'relative', height: '300vh', background: '#000' }}>
          <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
            <video
              ref={scrubVideoRef}
              src="/proto.mp4"
              muted
              playsInline
              preload="auto"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 40%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: '8%', left: 'clamp(28px, 6vw, 92px)',
              color: '#fff', maxWidth: '520px', zIndex: 2,
            }}>
              <span className="lp-eyebrow">Catalogue showcase</span>
              <h2 style={{ fontSize: 'clamp(30px, 3.2vw, 48px)', lineHeight: 1.05, margin: '12px 0 18px' }}>
                Serving trade buyers across Southern Africa.
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '17px', lineHeight: 1.65, fontWeight: 600 }}>
                Proto Trading ships to retailers and resellers throughout South Africa and the wider SADC region.
              </p>
            </div>
          </div>
        </section>

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
            <h2>8 buying departments, 8,000+ lines.</h2>
          </motion.div>
          <div className="lp-dept-grid">
            {departments.map((dept, i) => (
              <DeptCountCard
                key={dept.name}
                name={dept.name}
                count={dept.count}
                active={deptInView}
                delay={i * 0.07}
              />
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="lp-how" id="lp-how">
          <motion.div
            className="lp-section-header"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
          >
            <span className="lp-eyebrow">How it works</span>
            <h2>Three steps to trade access.</h2>
          </motion.div>
          <div className="lp-steps">
            {steps.map((step, i) => (
              <motion.article
                key={step.num}
                className={`lp-step ${i % 2 === 1 ? 'lp-step-alt' : ''}`}
                initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                <div className="lp-step-num">{step.num}</div>
                <div className="lp-step-body">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </motion.article>
            ))}
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
            <h2>Get access to the buying tools behind the portal.</h2>
            <p>Answer a few quick questions. Once approved, browse the catalogue, build quote requests and include product images in PDF order sheets.</p>
            <div className="lp-apply-note">
              <Clock3 size={18} />
              <span>Complete trade applications reviewed within 1 business day.</span>
            </div>
            <ul className="lp-apply-list">
              <li><CheckCircle2 size={17} />Trade-only access for retailers and resellers</li>
              <li><CheckCircle2 size={17} />Catalogue browsing by department, code and product</li>
              <li><CheckCircle2 size={17} />Quote requests with product images and quantities</li>
            </ul>
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
            <img src="/proto-logo.png" alt="Proto Trading" />
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
      </main>
      <TruckScrollbar />
    </div>
  );
}

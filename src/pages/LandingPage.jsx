import { useState, useEffect, useRef } from 'react';
import BillingDeliveryFields from '../components/register/BillingDeliveryFields';
import { useBillingDeliveryAddresses } from '../hooks/useBillingDeliveryAddresses';
import AboutModal from '../components/AboutModal';
import ProtoLogo from '../components/ProtoLogo';
import LandingHero from '../components/landing/LandingHero';
import LandingMapSection from '../components/landing/LandingMapSection';
import LandingDepartmentsSection from '../components/landing/LandingDepartmentsSection';
import LandingApplySection from '../components/landing/LandingApplySection';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  MessageCircle,
} from 'lucide-react';
import '../landing.css';

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
  'Craft & bead shop',
  'Packaging supplier',
  'Gift shop',
  'Educational supplier',
  'Religious / church store',
  'Promotional products',
  'Other',
];

const MONTHLY_SPEND_BANDS = [
  'R0 – R5,000',
  'R5,000 – R10,000',
  'R10,000 – R25,000',
  'R25,000 – R50,000',
  'R50,000+',
];

const STEP_LABELS = ['Company', 'Contact', 'Addresses', 'Additional'];

function CustomerIcon() {
  return (
    <svg width="28" height="30" viewBox="0 0 28 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="8" r="7" fill="#8B1A1A"/>
      <circle cx="14" cy="8" r="3.5" fill="#c0392b" opacity="0.6"/>
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

function Questionnaire({ onLogin }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [instantAccess, setInstantAccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [phone, setPhone] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(null);
  const [country, setCountry] = useState('South Africa');
  const [province, setProvince] = useState('');
  const addresses = useBillingDeliveryAddresses({ setProvince, setCountry });
  const {
    billingStreet,
    billingSuburb,
    billingCity,
    billingPostalCode,
    setBillingStreet,
    setBillingSuburb,
    setBillingCity,
    setBillingPostalCode,
    deliverySameAsBilling,
    streetName,
    suburb,
    postalCode,
    city,
    buildingType,
    unitNumber,
    otherBuildingType,
    setStreetName,
    setSuburb,
    setPostalCode,
    setCity,
    setBuildingType,
    setUnitNumber,
    setOtherBuildingType,
    onBillingPlaceSelect,
    handleDeliverySameAsBillingChange,
    resolvedBuildingType,
    buildStructuredBillingAddress,
    buildStructuredDeliveryAddress,
    deliveryFieldsLocked,
  } = addresses;
  const [businessType, setBusinessType] = useState([]); // multi-select
  const [otherType, setOtherType] = useState('');
  const toggleBusinessType = (t) =>
    setBusinessType((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const [monthlySpend, setMonthlySpend] = useState('');
  const [website, setWebsite] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [emailError, setEmailError] = useState('');

  const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const BLOCKED_DOMAINS = ['test.com', 'test.co.za', 'example.com', 'example.org', 'mailinator.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', '10minutemail.com', 'guerrillamail.com'];

  const validateEmailField = (value) => {
    const v = value.trim().toLowerCase();
    if (!v) return 'Please enter your email address.';
    if (!EMAIL_RE.test(v)) return 'Please enter a valid email address (e.g. name@company.co.za).';
    const domain = v.split('@')[1];
    if (BLOCKED_DOMAINS.includes(domain)) return 'Please use your real business email address.';
    return '';
  };

  const canNext = () => {
    if (step === 0) return companyName.trim() && contactName.trim();
    if (step === 1) {
      const phoneOk = phone.replace(/\D/g, '').length >= 8;
      const whatsappAnswered = typeof whatsappOptIn === 'boolean';
      return email.trim() && !validateEmailField(email) && phoneOk && password.trim().length >= 8 && whatsappAnswered;
    }
    if (step === 2) {
      const billingOk = billingStreet.trim()
        && billingSuburb.trim()
        && billingCity.trim()
        && billingPostalCode.trim();
      const deliveryOk = streetName.trim()
        && suburb.trim()
        && city.trim()
        && postalCode.trim()
        && buildingType
        && (buildingType !== 'Other' || otherBuildingType.trim())
        && (buildingType !== 'Apartments' || unitNumber.trim());
      return country.trim() && billingOk && deliveryOk;
    }
    if (step === 3) return true;
    return false;
  };

  const advance = async () => {
    if (step === 1) {
      const err = validateEmailField(email);
      setEmailError(err);
      if (err) return;
    }
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
      const deliveryLine = buildStructuredDeliveryAddress();
      const result = await submitTradeApplication({
        email: email.trim(),
        password,
        contactName: contactName.trim(),
        businessName: companyName.trim(),
        phone: phone.trim(),
        companyAddress: buildStructuredBillingAddress(),
        deliveryAddress: deliveryLine,
        streetName: streetName.trim(),
        suburb: suburb.trim(),
        postalCode: postalCode.trim(),
        buildingType: resolvedBuildingType(),
        unitNumber: buildingType === 'Apartments' ? unitNumber.trim() : '',
        vatNumber: vatNumber.trim() || null,
        country: country || null,
        province: province || null,
        city: billingCity.trim() || null,
        businessType: businessType
          .map((t) => (t === 'Other' ? otherType.trim() : t))
          .filter(Boolean)
          .join(', ') || null,
        monthlySpend: monthlySpend || null,
        website: website.trim() || null,
        acceptWhatsapp: typeof whatsappOptIn === 'boolean' ? whatsappOptIn : null,
        customerCode: customerCode.trim() || null,
      });
      setInstantAccess(Boolean(result?.instantAccess));
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
        <h3>{instantAccess ? 'You\'re approved' : 'Application received'}</h3>
        <p>
          {instantAccess
            ? `Welcome back, ${contactName}. Your email is on our active trade list — sign in with ${email.trim()} to access the catalogue.`
            : `Thank you, ${contactName}. Proto is reviewing your application and we will notify ${email.trim()} when you have been approved.`}
        </p>
        <button type="button" onClick={onLogin}>Go to sign in</button>
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
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
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
                  placeholder="Name"
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
                  onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                  onBlur={() => setEmailError(email.trim() ? validateEmailField(email) : '')}
                  onKeyDown={handleKey}
                  placeholder="name@business.co.za"
                  aria-invalid={!!emailError}
                />
                {emailError && (
                  <span style={{ color: '#f87171', fontSize: '12.5px', marginTop: '6px', display: 'block', fontWeight: 600 }}>
                    {emailError}
                  </span>
                )}
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
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
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
                        <div style={{ color: '#fff', fontWeight: '700', fontSize: '14px' }}>Can we contact you via WhatsApp?</div>
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
                        Yes
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
                        No
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
            <h3>Billing and delivery addresses</h3>
            <BillingDeliveryFields
              country={country}
              setCountry={setCountry}
              province={province}
              setProvince={setProvince}
              billingStreet={billingStreet}
              setBillingStreet={setBillingStreet}
              billingSuburb={billingSuburb}
              setBillingSuburb={setBillingSuburb}
              billingPostalCode={billingPostalCode}
              setBillingPostalCode={setBillingPostalCode}
              billingCity={billingCity}
              setBillingCity={setBillingCity}
              onBillingPlaceSelect={onBillingPlaceSelect}
              deliverySameAsBilling={deliverySameAsBilling}
              onDeliverySameAsBillingChange={handleDeliverySameAsBillingChange}
              streetName={streetName}
              setStreetName={setStreetName}
              suburb={suburb}
              setSuburb={setSuburb}
              postalCode={postalCode}
              setPostalCode={setPostalCode}
              city={city}
              setCity={setCity}
              buildingType={buildingType}
              setBuildingType={setBuildingType}
              unitNumber={unitNumber}
              setUnitNumber={setUnitNumber}
              otherBuildingType={otherBuildingType}
              setOtherBuildingType={setOtherBuildingType}
              deliveryFieldsLocked={deliveryFieldsLocked}
              onKeyDown={handleKey}
              buildingTypesClassName="lp-quiz-types"
            />
          </div>
        )}

        {step === 3 && (
          <div className="lp-quiz-step">
            <h3>Optional: add any extra business details.</h3>
            <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: '13px', lineHeight: 1.6, margin: '-4px 0 18px' }}>
              These details help the team, but they are not required to submit your trade request.
            </p>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Estimated monthly spend</div>
            <div className="lp-quiz-types">
              {MONTHLY_SPEND_BANDS.map((band) => (
                <button
                  key={band}
                  type="button"
                  className={`lp-quiz-type-card${monthlySpend === band ? ' selected' : ''}`}
                  onClick={() => setMonthlySpend(band)}
                >
                  {band}
                </button>
              ))}
            </div>
            <div style={{ height: '18px' }} />
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Business category <span style={{ opacity: 0.55, fontWeight: 400 }}>(select all that apply)</span></div>
            <div className="lp-quiz-types">
              {BUSINESS_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`lp-quiz-type-card${businessType.includes(t) ? ' selected' : ''}`}
                  onClick={() => toggleBusinessType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {businessType.includes('Other') && (
              <motion.div
                className="lp-quiz-field lp-quiz-other-field"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
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
            <div className="lp-quiz-field" style={{ marginTop: 18 }}>
              <label>Website or social media <span style={{ opacity: 0.55, fontWeight: 400 }}>(optional)</span></label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                onKeyDown={handleKey}
                placeholder="e.g. www.yourshop.co.za or @yourshop"
              />
            </div>
            <div className="lp-quiz-field" style={{ marginTop: 18 }}>
              <label>Existing Proto customer code <span style={{ opacity: 0.55, fontWeight: 400 }}>(optional)</span></label>
              <input
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                onKeyDown={handleKey}
                placeholder="6-character code, e.g. ETOSHA"
                maxLength={6}
                style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}
              />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
                If your email has changed since you last ordered, enter your account code so we can match and approve you instantly.
              </p>
            </div>
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

  const scrollToForm = () => {
    if (onApply) { onApply(); return; }
    document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="access-page">
      {/* ── Original header ── */}
      <header className="access-header">
        <div className="access-brand">
          <ProtoLogo variant="full" size="lg" tagline={false} />
        </div>
        <nav className="access-nav" aria-label="Public site navigation">
          <button type="button" onClick={() => document.getElementById('lp-departments')?.scrollIntoView({ behavior: 'smooth' })}>Departments</button>
          <button type="button" onClick={() => document.getElementById('lp-apply')?.scrollIntoView({ behavior: 'smooth' })}>Apply for a trade account</button>
          <button type="button" onClick={() => setShowAbout(true)}>About us</button>
          <button type="button" className="access-nav-login" onClick={onLogin}>Sign in</button>
        </nav>
      </header>

      <main>
        {/* ── Video hero ── */}
        <LandingHero onLogin={onLogin} onApply={scrollToForm} />

        <div>
        <LandingMapSection />
        <LandingDepartmentsSection />
        <LandingApplySection>
          <Questionnaire onLogin={onLogin} />
        </LandingApplySection>

        {/* ── Footer ── */}
        <footer className="lp-footer" style={{ flexWrap: 'wrap', rowGap: '16px' }}>
          <div className="lp-footer-brand">
            <ProtoLogo variant="full" size="md" tagline={false} />
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
                  style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
          <button className="access-login" type="button" onClick={onLogin}>
            <Lock size={15} />
            Sign in
          </button>
        </footer>
        </div>{/* end belowHero */}
      </main>
      <TruckScrollbar />
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}

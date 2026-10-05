import { useState, useEffect, useRef } from 'react';
import BillingDeliveryFields from '../components/register/BillingDeliveryFields';
import { useBillingDeliveryAddresses } from '../hooks/useBillingDeliveryAddresses';
import AboutModal from '../components/AboutModal';
import ProtoLogo from '../components/ProtoLogo';
import LandingHero from '../components/landing/LandingHero';
import LandingMapSection from '../components/landing/LandingMapSection';
import LandingDepartmentsSection from '../components/landing/LandingDepartmentsSection';
import LandingApplySection from '../components/landing/LandingApplySection';
import { trackJourneyEvent } from '../lib/journeyAnalytics';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';
import { checkRegistrationEmail } from '../lib/registrationEmailCheck';
import { createTradeApplicationAttempt } from '../lib/tradeApplicationAttempt.mjs';
import { firstInvalidRegistrationStep, REGISTRATION_FIELD_IDS, REGISTRATION_FIELD_STEPS, registrationEmailCheckFailure, registrationErrorId, validateRegistrationEmail, validateRegistrationStep } from '../lib/registrationValidation.mjs';
import { PRODUCT_CATEGORIES, TRADING_CHANNELS } from '../lib/businessTypes';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  MessageCircle,
} from 'lucide-react';
import '../landing.css';
import '../components/register/RegistrationFeedback.css';

const MONTHLY_SPEND_BANDS = [
  'R0 – R5,000',
  'R5,000 – R10,000',
  'R10,000 – R25,000',
  'R25,000 – R50,000',
  'R50,000+',
];

const STEP_LABELS = ['Company', 'Contact', 'Addresses', 'Business'];

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
  const [scrolling, setScrolling] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const frameRef = useRef(null);
  const idleTimerRef = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function updateProgress() {
      frameRef.current = null;
      if (reducedMotion.matches) {
        setVisible(false);
        setScrolling(false);
        return;
      }

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH <= 0) {
        setVisible(false);
        return;
      }

      setProgress(Math.min(Math.max(scrollTop / docH, 0), 1));
      setViewportHeight(window.innerHeight);
      setVisible(true);
      setScrolling(true);

      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => setScrolling(false), 220);
    }

    function scheduleUpdate() {
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(updateProgress);
      }
    }

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    reducedMotion.addEventListener('change', scheduleUpdate);

    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      reducedMotion.removeEventListener('change', scheduleUpdate);
      window.clearTimeout(idleTimerRef.current);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

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

  const journeyPad = 44;
  const thumbTop = journeyPad + progress * Math.max(0, viewportHeight - journeyPad * 2);

  if (!visible) return null;

  return (
    <div
      className={`proto-journey-rail${scrolling ? ' is-scrolling' : ' is-idle'}`}
      aria-hidden="true"
    >
      <div className="proto-journey-track">
        <div className="proto-journey-progress" style={{ height: `${progress * 100}%` }} />
        {/* Stage waypoint dots */}
        {[0.2, 0.4, 0.6, 0.8].map(p => {
          const passed = progress >= p - 0.01;
          return (
            <div
              key={p}
              className={`proto-journey-waypoint${passed ? ' is-passed' : ''}`}
              style={{ top: `${p * 100}%` }}
            />
          );
        })}
      </div>

      <div className="proto-journey-thumb" style={{ transform: `translate3d(-50%, ${thumbTop}px, 0)` }}>
        <div className="proto-journey-thumb-icon">
        <div className="proto-journey-thumb-icon-layer" style={{
          transform: curTransform,
          opacity: 1 - blend,
        }}>
          <CurIcon />
        </div>
        <div className="proto-journey-thumb-icon-layer" style={{
          transform: nxtTransform,
          opacity: blend,
        }}>
          <NxtIcon />
        </div>
        </div>
      </div>

      <div className="proto-journey-start" />
    </div>
  );
}

function Questionnaire({ onLogin }) {
  const previewBusinessStep = typeof window !== 'undefined'
    && window.location.hostname.endsWith('.vercel.app')
    && new URLSearchParams(window.location.search).get('previewStep') === 'business';
  const [step, setStep] = useState(previewBusinessStep ? 3 : 0);
  const [done, setDone] = useState(false);
  const [instantAccess, setInstantAccess] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitCode, setSubmitCode] = useState('');
  const [showAccountRecovery, setShowAccountRecovery] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverFields, setServerFields] = useState({});
  const summaryRef = useRef(null);
  const submitNoticeRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const successRef = useRef(null);
  const submissionLockRef = useRef(false);
  const resendLockRef = useRef(false);
  const resendControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(null);
  const stepFocusRef = useRef(false);
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
  const [tradingChannels, setTradingChannels] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [otherProductCategory, setOtherProductCategory] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const toggleTradingChannel = (value) =>
    setTradingChannels((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  const toggleProductCategory = (value) =>
    setProductCategories((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  const [monthlySpend, setMonthlySpend] = useState('');
  const [website, setWebsite] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailCheck, setEmailCheck] = useState({ status: 'idle', checkedEmail: '', message: '' });
  const emailCheckSequence = useRef(0);

  const formValues = { companyName, contactName, email, phone, password, whatsappOptIn, country,
    billingStreet, billingSuburb, billingCity, billingPostalCode, streetName, suburb, city, postalCode,
    buildingType, otherBuildingType, unitNumber, tradingChannels, productCategories, otherProductCategory, businessDescription };
  const currentValidation = validateRegistrationStep(step, formValues);
  const activeServerErrors = Object.fromEntries(Object.entries(serverFields)
    .filter(([key, detail]) => REGISTRATION_FIELD_STEPS[key] === step && detail.value === formValues[key])
    .map(([key, detail]) => [key, detail.message]));
  const visibleErrors = Object.fromEntries(Object.entries({ ...fieldErrors, ...activeServerErrors }).filter(([key]) => (
    currentValidation[key] || activeServerErrors[key] || (key === 'email' && ['existing', 'error'].includes(emailCheck.status))
  )).map(([key, message]) => [key, currentValidation[key] || (key === 'email' ? emailError : '') || message]));
  const fieldError = (key) => visibleErrors[key] || (key === 'email' ? emailError : '') || '';
  const fieldFeedback = (key, helpId) => ({
    'aria-invalid': Boolean(fieldError(key)),
    'aria-describedby': [helpId, fieldError(key) ? registrationErrorId(key) : ''].filter(Boolean).join(' ') || undefined,
  });
  const errorText = (key) => fieldError(key) && (
    <span id={registrationErrorId(key)} className="lp-register-field-error">{fieldError(key)}</span>
  );
  const focusField = (key) => {
    const target = document.getElementById(REGISTRATION_FIELD_IDS[key]);
    target?.focus();
  };

  useEffect(() => {
    if (done) successRef.current?.focus();
    else if (Object.keys(fieldErrors).length) summaryRef.current?.focus();
    else if (stepFocusRef.current) {
      stepHeadingRef.current?.focus();
      stepFocusRef.current = false;
    }
    else if (submitError) submitNoticeRef.current?.focus();
  }, [done, fieldErrors, submitError, step]);

  useEffect(() => {
    if (!attemptRef.current) attemptRef.current = createTradeApplicationAttempt();
    mountedRef.current = true;
    if (attemptRef.current.state === 'unknown') {
      setOutcomeUnknown(true);
      setShowAccountRecovery(true);
      setSubmitError('We cannot confirm the result of your earlier application. It may already have been saved. Check your inbox and spam folder for confirmation before applying again.');
    }
    return () => { mountedRef.current = false; emailCheckSequence.current += 1; attemptRef.current?.cancel(); resendControllerRef.current?.abort(); };
  }, []);

  useEffect(() => {
    trackJourneyEvent('registration_started', { journey: 'registration', step: 'company' });
  }, []);

  const checkEmailAvailability = async () => {
    const normalized = email.trim().toLowerCase();
    const validationError = validateRegistrationEmail(normalized);
    setEmailError(validationError);
    if (validationError) {
      setEmailCheck({ status: 'idle', checkedEmail: '', message: '' });
      return false;
    }
    if (emailCheck.checkedEmail === normalized && emailCheck.status === 'available') return true;
    if (emailCheck.checkedEmail === normalized && emailCheck.status === 'existing') return false;
    const sequence = ++emailCheckSequence.current;
    setEmailCheck({ status: 'checking', checkedEmail: normalized, message: 'Checking your email…' });
    try {
      const result = await checkRegistrationEmail(normalized);
      if (sequence !== emailCheckSequence.current || !mountedRef.current) return false;
      if (typeof result?.exists !== 'boolean' || result.available !== !result.exists) {
        setEmailCheck({ status: 'error', checkedEmail: normalized, message: 'We could not confirm the email check. Your application has not been submitted. Please try the check again.' });
        return false;
      }
      if (result.exists) {
        setEmailCheck({ status: 'existing', checkedEmail: normalized, message: 'This email is already registered.' });
        return false;
      }
      setEmailCheck({ status: 'available', checkedEmail: normalized, message: 'Email available — continue your application.' });
      return true;
    } catch (error) {
      if (sequence !== emailCheckSequence.current || !mountedRef.current) return false;
      const guidance = registrationEmailCheckFailure(error);
      setEmailError(guidance.fieldError);
      setEmailCheck({ status: 'error', checkedEmail: normalized, message: guidance.message });
      return false;
    }
  };

  const advance = async () => {
    if (submissionLockRef.current || outcomeUnknown) return;
    if (!attemptRef.current) attemptRef.current = createTradeApplicationAttempt();
    if (attemptRef.current.state === 'unknown' || attemptRef.current.state === 'confirmed') return;
    submissionLockRef.current = true;
    try {
      const errors = { ...activeServerErrors, ...validateRegistrationStep(step, formValues) };
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        trackJourneyEvent('registration_validation_failed', {
          journey: 'registration', step: STEP_LABELS[step].toLowerCase(), outcome: 'blocked',
        });
        return;
      }
      setFieldErrors({});
      if (step === 1 && !(await checkEmailAvailability())) {
        setFieldErrors({ email: 'Check the email message below before continuing.' });
        return;
      }
      if (step < STEP_LABELS.length - 1) {
        trackJourneyEvent('registration_step_completed', {
          journey: 'registration', step: STEP_LABELS[step].toLowerCase(), outcome: 'success',
        });
        stepFocusRef.current = true;
        setStep(step + 1);
        return;
      }
      const invalid = firstInvalidRegistrationStep(formValues);
      if (invalid) {
        setStep(invalid.step);
        setFieldErrors(invalid.errors);
        return;
      }
      setSubmitting(true);
      setSubmitError('');
      setSubmitCode('');
      setServerFields({});
      setShowAccountRecovery(false);
      const deliveryLine = buildStructuredDeliveryAddress();
      const result = await attemptRef.current.submit({
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
        salesChannels: tradingChannels,
        productCategories,
        otherProductCategory: otherProductCategory.trim() || null,
        businessType: productCategories
          .map((category) => (category === 'Other' ? otherProductCategory.trim() : category))
          .filter(Boolean)
          .join(', ') || null,
        businessDescription: businessDescription.trim(),
        monthlySpend: monthlySpend || null,
        website: website.trim() || null,
        acceptWhatsapp: typeof whatsappOptIn === 'boolean' ? whatsappOptIn : null,
        customerCode: customerCode.trim() || null,
      });
      if (!mountedRef.current) return;
      setInstantAccess(Boolean(result?.instantAccess));
      setVerificationRequired(result?.emailVerificationRequired === true);
      setVerificationSent(result?.verificationEmailSent === true);
      setPassword('');
      setShowPw(false);
      setDone(true);
      trackJourneyEvent('registration_completed', {
        journey: 'registration',
        step: 'submitted',
        outcome: result?.instantAccess ? 'instant_access' : 'pending_review',
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const storageBlocked = err.code === 'REGISTRATION_STORAGE_UNAVAILABLE';
      const unknown = err.outcomeUnknown === true || err.retrySafe !== true;
      setPassword('');
      setShowPw(false);
      setOutcomeUnknown(unknown);
      setSubmitCode(err.code || 'REGISTRATION_OUTCOME_UNKNOWN');
      setShowAccountRecovery(!storageBlocked && (unknown || err.recovery === 'SIGN_IN_OR_RESET_PASSWORD'));
      const knownCodes = ['REGISTRATION_STORAGE_UNAVAILABLE', 'REGISTRATION_OUTCOME_UNKNOWN', 'REGISTRATION_VALIDATION_FAILED', 'REGISTRATION_RATE_LIMITED', 'REGISTRATION_UNAVAILABLE', 'EMAIL_ALREADY_REGISTERED'];
      setSubmitError(knownCodes.includes(err.code) ? err.message : unknown
        ? 'We cannot confirm whether your application was saved. Check your inbox and spam folder for confirmation. Please do not submit another application while the result is uncertain.'
        : err.code === 'EMAIL_ALREADY_REGISTERED'
          ? 'We could not create a new account with these details. If you have applied before, sign in or reset your password.'
          : 'Your application was not submitted. Your other details are still here. Check your connection and details, then re-enter your password to try again.');
      if (!unknown) {
        setStep(1);
        const knownFields = Object.entries(err.fieldErrors || {}).filter(([key]) => REGISTRATION_FIELD_IDS[key]);
        // Keep only nonsecret field values in memory so editing a rejected field
        // clears its server feedback. A failed password is always cleared.
        setServerFields(Object.fromEntries(knownFields.filter(([key]) => key !== 'password')
          .map(([key, message]) => [key, { message, value: formValues[key] }])));
        setFieldErrors({ password: 'Create a password of at least 8 characters.' });
      }
      trackJourneyEvent('registration_failed', {
        journey: 'registration',
        step: 'submitted',
        outcome: unknown ? 'unknown' : 'error',
      });
    } finally {
      submissionLockRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.repeat && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      void advance();
    }
  };

  const goToLogin = (mode = 'login') => {
    if (submitting) return;
    setPassword(''); setShowPw(false);
    onLogin?.({ initialEmail: email.trim(), initialMode: mode });
  };

  if (done) {
    return (
      <div className="lp-quiz-success" ref={successRef} tabIndex={-1} role="region" aria-labelledby="trade-application-success">
        <CheckCircle2 size={48} />
        <h3 id="trade-application-success">{verificationRequired ? 'Application saved — confirm your email' : instantAccess ? 'You\'re approved' : 'Application received'}</h3>
        <p>
          {verificationRequired
            ? `Thank you, ${contactName}. Your application has been saved. ${verificationSent ? 'Use the confirmation link sent to' : 'Request a confirmation link for'} ${email.trim()} before signing in. Existing trade customers receive access after email confirmation; new applications are reviewed by our team.`
            : instantAccess
            ? `Welcome back, ${contactName}. Your email is on our active trade list — sign in with ${email.trim()} to access the catalogue.`
            : `Thank you, ${contactName}. Proto is reviewing your application and we will notify ${email.trim()} when you have been approved.`}
        </p>
        {verificationRequired && <button type="button" disabled={resending} onClick={async () => {
          if (resendLockRef.current) return;
          resendLockRef.current = true;
          resendControllerRef.current = new AbortController();
          setResending(true); setVerificationNotice('');
          try {
            const { resendTradeVerification } = await import('../lib/auth');
            const result = await resendTradeVerification(email, { signal: resendControllerRef.current.signal });
            if (!mountedRef.current) return;
            setVerificationNotice(result?.ok === true
              ? 'Your confirmation-link request was received. If your application needs confirmation, check your inbox and spam folder.'
              : 'We could not confirm that your request was received. Check your inbox and spam folder before requesting another link.');
          } catch { if (mountedRef.current) setVerificationNotice('We could not confirm that a new link was sent. Check your inbox and spam folder before requesting another link.'); }
          finally { resendLockRef.current = false; resendControllerRef.current = null; if (mountedRef.current) setResending(false); }
        }}>{resending ? 'Requesting confirmation…' : verificationSent ? 'Request another confirmation email' : 'Request confirmation email'}</button>}
        {verificationNotice && <p role="status">{verificationNotice}</p>}
        <button type="button" onClick={() => goToLogin()}>Go to sign in</button>
      </div>
    );
  }

  return (
    <div className="lp-quiz" aria-busy={submitting}>
      <div className="lp-quiz-progress">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className={`lp-quiz-prog-seg ${i <= step ? 'active' : ''}`} />
        ))}
      </div>
      <p className="lp-quiz-step-label">Step {step + 1} of {STEP_LABELS.length} - {STEP_LABELS[step]}</p>

      {Object.keys(visibleErrors).length > 0 && (
        <div ref={summaryRef} className="lp-register-error-summary" role="alert" tabIndex={-1} aria-labelledby="trade-error-summary-title">
          <h4 id="trade-error-summary-title">Please check these details</h4>
          <ul>
            {Object.entries(visibleErrors).map(([key, message]) => (
              <li key={key}><a href={`#${REGISTRATION_FIELD_IDS[key]}`} onClick={(event) => { event.preventDefault(); focusField(key); }}>{message}</a></li>
            ))}
          </ul>
        </div>
      )}
      {submitError && (
        <div ref={submitNoticeRef} className="lp-register-submit-notice" role="alert" tabIndex={-1} aria-labelledby="trade-submit-notice-title">
          <h4 id="trade-submit-notice-title">{submitCode === 'REGISTRATION_STORAGE_UNAVAILABLE' ? 'Application not sent — browser storage needed' : outcomeUnknown ? 'Application result not confirmed' : 'Application not submitted'}</h4>
          <p>{submitError}</p>
          {outcomeUnknown && submitCode !== 'REGISTRATION_STORAGE_UNAVAILABLE' && <p>You can try signing in if you have already completed email confirmation, or use password recovery. Contact Proto if you still cannot confirm the result.</p>}
          {showAccountRecovery && onLogin && (
            <div className="lp-register-recovery-actions">
              <button type="button" className="lp-register-recovery-action" disabled={submitting} onClick={() => {
                goToLogin();
              }}>Sign in</button>
              <button type="button" className="lp-register-recovery-action" disabled={submitting} onClick={() => {
                goToLogin('forgot');
              }}>Reset password</button>
            </div>
          )}
        </div>
      )}
      {submitting && <p className="lp-register-pending" role="status">Submitting your application. Keep this page open until the result is confirmed.</p>}

      <fieldset className="lp-register-fields" disabled={submitting} aria-label={`${STEP_LABELS[step]} registration details`}>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {step === 0 && (
          <div className="lp-quiz-step">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="lp-register-step-heading">Start with the core company details.</h3>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label htmlFor="trade-company-name">Company name</label>
                <input
                  id="trade-company-name"
                  name="business_name"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Name"
                  required
                  aria-required="true"
                  {...fieldFeedback('companyName')}
                />
                {errorText('companyName')}
              </div>
              <div className="lp-quiz-field">
                <label htmlFor="trade-contact-name">Contact person name and surname</label>
                <input
                  id="trade-contact-name"
                  name="contact_name"
                  autoComplete="name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Full contact name"
                  required
                  aria-required="true"
                  {...fieldFeedback('contactName')}
                />
                {errorText('contactName')}
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label htmlFor="trade-vat-number">VAT number <span style={{ opacity: 0.55, fontWeight: 500 }}>(optional)</span></label>
                <input
                  id="trade-vat-number"
                  name="vat_number"
                  autoComplete="off"
                  inputMode="numeric"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="VAT registration number"
                />
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label htmlFor="trade-customer-code">Existing Proto customer code <span style={{ opacity: 0.55, fontWeight: 500 }}>(optional)</span></label>
                <input
                  id="trade-customer-code"
                  name="customer_code"
                  autoComplete="off"
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  onKeyDown={handleKey}
                  placeholder="6-character code, e.g. ETOSHA"
                  maxLength={6}
                  style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}
                />
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
                  This helps us find your previous Proto purchasing history. Leave it blank if you do not know it.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="lp-quiz-step">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="lp-register-step-heading">Add the account and contact details.</h3>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label htmlFor="trade-email">Email address</label>
                <input
                  id="trade-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    emailCheckSequence.current += 1;
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                    setEmailCheck({ status: 'idle', checkedEmail: '', message: '' });
                  }}
                  onBlur={() => { if (email.trim()) void checkEmailAvailability(); }}
                  onKeyDown={handleKey}
                  placeholder="name@business.co.za"
                  {...fieldFeedback('email')}
                  required
                  aria-required="true"
                />
                {errorText('email')}
                {!emailError && emailCheck.status !== 'idle' && (
                  <div className={`lp-register-email-status lp-register-email-status--${emailCheck.status}`} role="status" aria-live="polite">
                    <span>{emailCheck.message}</span>
                    {emailCheck.status === 'existing' && onLogin && (
                      <div className="lp-register-recovery-actions">
                        <button type="button" className="lp-register-recovery-action" onClick={() => goToLogin()}>Sign in</button>
                        <button type="button" className="lp-register-recovery-action" onClick={() => goToLogin('forgot')}>Reset password</button>
                      </div>
                    )}
                    {emailCheck.status === 'error' && (
                      <button type="button" className="lp-register-email-retry" onClick={() => void checkEmailAvailability()}>Try again</button>
                    )}
                  </div>
                )}
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label htmlFor="trade-phone">Phone number</label>
                <input
                  id="trade-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="+27"
                  required
                  aria-required="true"
                  {...fieldFeedback('phone')}
                />
                {errorText('phone')}
              </div>

              {/* WhatsApp opt-in CTA — appears once phone is filled */}
              {(phone.replace(/\D/g, '').length >= 8 || fieldError('whatsappOptIn')) && (
                <motion.div
                  className="lp-quiz-field lp-quiz-field--full"
                  id="trade-whatsapp-choice"
                  role="group"
                  tabIndex={-1}
                  aria-labelledby="trade-whatsapp-choice-label"
                  {...fieldFeedback('whatsappOptIn')}
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
                        <div id="trade-whatsapp-choice-label" style={{ color: '#fff', fontWeight: '700', fontSize: '14px' }}>Can we contact you via WhatsApp? (required)</div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', marginTop: '2px' }}>Get specials, stock alerts and order updates straight to your phone.</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setWhatsappOptIn(true)}
                        aria-pressed={whatsappOptIn === true}
                        style={{
                          flex: 1, minHeight: '48px', padding: '11px', borderRadius: '8px', border: 'none',
                          fontFamily: 'inherit', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                          background: whatsappOptIn === true ? '#16a34a' : 'rgba(22,163,74,0.2)',
                          color: whatsappOptIn === true ? '#fff' : '#4ade80',
                          transition: 'all 0.15s',
                        }}
                      >
                        {whatsappOptIn === true ? '✓ Yes, send updates' : 'Yes, send updates'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setWhatsappOptIn(false)}
                        aria-pressed={whatsappOptIn === false}
                        style={{
                          flex: 1, minHeight: '48px', padding: '11px', borderRadius: '8px',
                          border: whatsappOptIn === false ? '1px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                          fontFamily: 'inherit', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                          background: whatsappOptIn === false ? '#fff' : 'transparent',
                          color: whatsappOptIn === false ? '#0f172a' : 'rgba(255,255,255,0.45)',
                          boxShadow: whatsappOptIn === false ? '0 0 0 2px rgba(255,255,255,0.18)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {whatsappOptIn === false ? '✓ No WhatsApp updates' : 'No WhatsApp updates'}
                      </button>
                    </div>
                  </div>
                  {errorText('whatsappOptIn')}
                </motion.div>
              )}

              <div className="lp-quiz-field lp-quiz-field--full">
                <label htmlFor="trade-new-password">Password <span style={{ opacity: 0.55, fontWeight: 500 }}>(min. 8 characters)</span></label>
                <div className="lp-quiz-pw-wrap">
                  <input
                    id="trade-new-password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                    aria-required="true"
                    {...fieldFeedback('password')}
                  />
                  <button
                    type="button"
                    className="lp-quiz-pw-eye"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    aria-pressed={showPw}
                  >
                    {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
                {errorText('password')}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="lp-quiz-step">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="lp-register-step-heading">Billing and delivery addresses</h3>
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
              fieldHasIssue={(key) => Boolean(fieldError(key))}
              fieldError={fieldError}
              onKeyDown={handleKey}
              buildingTypesClassName="lp-quiz-types"
            />
          </div>
        )}

        {step === 3 && (
          <div className="lp-quiz-step">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="lp-register-step-heading">Tell us about your business.</h3>
            <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: '13px', lineHeight: 1.6, margin: '-4px 0 18px' }}>
              Three quick details are required. Monthly spend and website are optional.
            </p>
            <div id="landing-trading-channel-label" className="lp-quiz-question-label">
              1. How do you trade? <span>(required — select all that apply)</span>
            </div>
            <div className="lp-quiz-types" role="group" aria-labelledby="landing-trading-channel-label" aria-required="true" id="landing-trading-channels" tabIndex={-1} {...fieldFeedback('tradingChannels')}>
              {TRADING_CHANNELS.map((channel) => {
                const selected = tradingChannels.includes(channel);
                return (
                <button
                  key={channel}
                  type="button"
                  className={`lp-quiz-type-card lp-quiz-type-card--multi${selected ? ' selected' : ''}`}
                  onClick={() => toggleTradingChannel(channel)}
                  aria-pressed={selected}
                >
                  <span>{channel}</span>{selected && <Check size={15} strokeWidth={3} aria-hidden="true" />}
                </button>
              );})}
            </div>
            {errorText('tradingChannels')}
            <div id="landing-product-category-label" className="lp-quiz-question-label lp-quiz-question-label--second">
              2. What do you mainly sell? <span>(required — select all that apply)</span>
            </div>
            <div className="lp-quiz-types" role="group" aria-labelledby="landing-product-category-label" aria-required="true" id="landing-product-categories" tabIndex={-1} {...fieldFeedback('productCategories')}>
              {PRODUCT_CATEGORIES.map((category) => {
                const selected = productCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    className={`lp-quiz-type-card lp-quiz-type-card--multi${selected ? ' selected' : ''}`}
                    onClick={() => toggleProductCategory(category)}
                    aria-pressed={selected}
                  >
                    <span>{category}</span>{selected && <Check size={15} strokeWidth={3} aria-hidden="true" />}
                  </button>
                );})}
            </div>
            {errorText('productCategories')}
            {productCategories.includes('Other') && (
              <motion.div
                className="lp-quiz-field lp-quiz-other-field"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                <label htmlFor="landing-other-product-category">Name the other product category</label>
                <input
                  id="landing-other-product-category"
                  value={otherProductCategory}
                  onChange={(e) => setOtherProductCategory(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="For example: Florist supplies"
                  required
                  {...fieldFeedback('otherProductCategory')}
                />
                {errorText('otherProductCategory')}
              </motion.div>
            )}
            <div className="lp-quiz-field" style={{ marginTop: 18 }}>
              <label htmlFor="landing-business-description">
                3. What do you sell, and who do you normally sell to? <span style={{ opacity: 0.7 }}>(required)</span>
              </label>
              <textarea
                id="landing-business-description"
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value.slice(0, 400))}
                placeholder="Example: Gifts and party supplies sold from our Bellville shop to walk-in customers and event planners."
                minLength={20}
                maxLength={400}
                required
                {...fieldFeedback('businessDescription', 'landing-business-description-help')}
              />
              <span id="landing-business-description-help" className="lp-quiz-field-help">
                Tell us what you sell, where you sell — store, online or market — and who your typical customers are. {businessDescription.length}/400
              </span>
              {errorText('businessDescription')}
            </div>
            <div style={{ height: '18px' }} />
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>
              Estimated monthly spend <span style={{ opacity: 0.55, fontWeight: 400 }}>(optional)</span>
            </div>
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
            <div className="lp-quiz-field" style={{ marginTop: 18 }}>
              <label>Website or social media <span style={{ opacity: 0.55, fontWeight: 400 }}>(optional)</span></label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                onKeyDown={handleKey}
                placeholder="e.g. www.yourshop.co.za or @yourshop"
              />
            </div>
          </div>
        )}
      </motion.div>
      </fieldset>

      <div className="lp-quiz-nav">
        {step > 0 ? (
          <button type="button" className="lp-quiz-back" onClick={() => { setFieldErrors({}); stepFocusRef.current = true; setStep(step - 1); }} disabled={submitting || emailCheck.status === 'checking'}>
            ← Back
          </button>
        ) : <span />}
        <button
          type="button"
          className="lp-quiz-next"
          disabled={submitting || outcomeUnknown || emailCheck.status === 'checking'}
          onClick={() => void advance()}
        >
          {submitting ? 'Submitting…' : step < STEP_LABELS.length - 1 ? 'Next' : 'Submit application'}
          {!submitting && step < STEP_LABELS.length - 1 && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}

function RegistrationCampaignHero({ onApply }) {
  return (
    <section className="registration-campaign-hero" aria-label="Proto Trading Online registration">
      <button
        type="button"
        className="registration-campaign-hero__action"
        onClick={onApply}
        aria-label="Existing customers must re-register and new customers can apply online. Go to the registration form."
      >
        <img
          src="/register-reregister-banner-v3.webp"
          alt="Welcome to the new Proto Trading Online. Existing customers must re-register. New customers can apply for online access."
          fetchPriority="high"
          decoding="async"
        />
      </button>
      <p className="registration-campaign-hero__hint">
        Select the banner to re-register or apply for Proto Trading Online access.
      </p>
    </section>
  );
}

export default function LandingPage({ onLogin, onApply, registrationMode = false }) {
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
          <button type="button" onClick={() => setShowAbout(true)}>About us</button>
          <button type="button" className="access-nav-login" onClick={onLogin}>Sign in</button>
        </nav>
      </header>

      <main>
        {registrationMode
          ? <RegistrationCampaignHero onApply={scrollToForm} />
          : <LandingHero onApply={scrollToForm} />}

        <div>
        <LandingMapSection />
        <LandingDepartmentsSection onApply={scrollToForm} />
        <LandingApplySection registrationMode={registrationMode}>
          <Questionnaire onLogin={onLogin} />
        </LandingApplySection>

        {/* ── Footer ── */}
        <footer className="lp-footer" style={{ flexWrap: 'wrap', rowGap: '16px' }}>
          <div className="lp-footer-brand">
            <ProtoLogo variant="full" size="md" tagline={false} />
          </div>
          <div className="lp-footer-copy">
            <p style={{ margin: 0 }}>Trade access only. Not open to the general public.</p>
            <div className="lp-footer-policy-links">
              {[
                { label: 'Returns Policy', hash: '#/policies/returns' },
                { label: 'Shipping Policy', hash: '#/policies/shipping' },
                { label: 'Terms & Conditions', hash: '#/policies/terms' },
                { label: 'Privacy Policy', hash: '#/policies/privacy' },
              ].map(({ label, hash }) => (
                <a
                  key={hash}
                  href={hash}
                  className="lp-footer-policy-link"
                  onClick={(e) => { e.preventDefault(); window.location.hash = hash.slice(1); }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </footer>
        </div>{/* end belowHero */}
      </main>
      <TruckScrollbar />
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}

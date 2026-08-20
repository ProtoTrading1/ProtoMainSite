import { useRef, useState } from 'react';
import BusinessCategoryPicker from '../components/register/BusinessCategoryPicker';
import BillingDeliveryFields from '../components/register/BillingDeliveryFields';
import MonthlySpendOptional from '../components/register/MonthlySpendOptional';
import { useBillingDeliveryAddresses } from '../hooks/useBillingDeliveryAddresses';
import { MONTHLY_SPEND_BANDS, PRODUCT_CATEGORIES, TRADING_CHANNELS } from '../lib/businessTypes';
import { Check, CheckCircle2, Eye, EyeOff, Lock, MessageCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { submitTradeApplication } from '../lib/tradeApplication';
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';
import { checkRegistrationEmail } from '../lib/registrationEmailCheck';
import ProtoLogo from '../components/ProtoLogo';
import '../landing.css';

const STANDALONE_STEPS = ['Contact', 'Company', 'Business', 'Addresses'];

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const BLOCKED_DOMAINS = ['test.com', 'test.co.za', 'example.com', 'example.org', 'mailinator.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', '10minutemail.com', 'guerrillamail.com'];

function validateEmailField(value) {
  const v = value.trim().toLowerCase();
  if (!v) return 'Please enter your email address.';
  if (!EMAIL_RE.test(v)) return 'Please enter a valid email address (e.g. name@company.co.za).';
  const domain = v.split('@')[1];
  if (BLOCKED_DOMAINS.includes(domain)) return 'Please use your real business email address.';
  return '';
}

export default function RegisterPage({ onLogin, standalone = false }) {
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [phone, setPhone] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [tradingChannels, setTradingChannels] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [otherProductCategory, setOtherProductCategory] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [monthlySpend, setMonthlySpend] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('South Africa');
  const [province, setProvince] = useState('');
  const [companyFax, setCompanyFax] = useState('');

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

  const [emailError, setEmailError] = useState('');
  const [emailCheck, setEmailCheck] = useState({ status: 'idle', checkedEmail: '', message: '' });
  const emailCheckSequence = useRef(0);
  const [validationIssues, setValidationIssues] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showAccountRecovery, setShowAccountRecovery] = useState(false);
  const [done, setDone] = useState(false);
  const [instantAccess, setInstantAccess] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const [customerCode, setCustomerCode] = useState('');
  const [standaloneStep, setStandaloneStep] = useState(0);

  const toggleTradingChannel = (value) =>
    setTradingChannels((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  const toggleProductCategory = (value) =>
    setProductCategories((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));

  const resolvedDeliveryAddress = () => buildStructuredDeliveryAddress();

  const collectValidationIssues = () => {
    const issues = [];
    if (!contactName.trim()) {
      issues.push({ key: 'contactName', message: 'Contact person name and surname', section: 'contact' });
    }
    if (!email.trim()) {
      issues.push({ key: 'email', message: 'Email address', section: 'contact' });
    } else {
      const emailErr = validateEmailField(email);
      if (emailErr) issues.push({ key: 'email', message: emailErr, section: 'contact' });
    }
    if (phone.replace(/\D/g, '').length < 8) {
      issues.push({ key: 'phone', message: 'Phone number (at least 8 digits)', section: 'contact' });
    }
    if (passwordPolicyError(password)) {
      issues.push({ key: 'password', message: `Password (minimum ${MIN_PASSWORD_LENGTH} characters)`, section: 'contact' });
    }
    if (confirmPassword.trim().length < 8) {
      issues.push({ key: 'confirmPassword', message: 'Confirm password', section: 'contact' });
    }
    if (password.trim() && confirmPassword.trim() && password !== confirmPassword) {
      issues.push({ key: 'confirmPassword', message: 'Passwords must match', section: 'contact' });
    }
    if (typeof whatsappOptIn !== 'boolean') {
      issues.push({ key: 'whatsapp', message: 'WhatsApp question â€” choose Yes or No', section: 'contact' });
    }
    if (!businessName.trim()) {
      issues.push({ key: 'businessName', message: 'Company / trading name', section: 'business' });
    }
    if (tradingChannels.length === 0) {
      issues.push({ key: 'tradingChannels', message: 'How you trade â€” select at least one option', section: 'business' });
    }
    if (productCategories.length === 0) {
      issues.push({ key: 'productCategories', message: 'What you sell â€” select at least one option', section: 'business' });
    }
    if (productCategories.includes('Other') && !otherProductCategory.trim()) {
      issues.push({ key: 'otherProductCategory', message: 'Name the other product category', section: 'business' });
    }
    if (businessDescription.trim().length < 20) {
      issues.push({ key: 'businessDescription', message: 'Business description (at least 20 characters)', section: 'business' });
    }
    if (!country.trim()) {
      issues.push({ key: 'country', message: 'Country', section: 'addresses' });
    }
    if (!billingStreet.trim()) {
      issues.push({ key: 'billingStreet', message: 'Billing street name', section: 'addresses' });
    }
    if (!billingSuburb.trim()) {
      issues.push({ key: 'billingSuburb', message: 'Billing suburb', section: 'addresses' });
    }
    if (!billingPostalCode.trim()) {
      issues.push({ key: 'billingPostalCode', message: 'Billing postal code', section: 'addresses' });
    }
    if (!billingCity.trim()) {
      issues.push({ key: 'billingCity', message: 'Billing city', section: 'addresses' });
    }
    if (!streetName.trim()) {
      issues.push({ key: 'streetName', message: 'Delivery street name', section: 'addresses' });
    }
    if (!suburb.trim()) {
      issues.push({ key: 'suburb', message: 'Delivery suburb', section: 'addresses' });
    }
    if (!postalCode.trim()) {
      issues.push({ key: 'postalCode', message: 'Delivery postal code', section: 'addresses' });
    }
    if (!city.trim()) {
      issues.push({ key: 'city', message: 'Delivery city', section: 'addresses' });
    }
    if (!buildingType) {
      issues.push({ key: 'buildingType', message: 'Building type', section: 'addresses' });
    }
    if (buildingType === 'Other' && !otherBuildingType.trim()) {
      issues.push({ key: 'otherBuildingType', message: 'Describe building type', section: 'addresses' });
    }
    if (buildingType === 'Apartments' && !unitNumber.trim()) {
      issues.push({ key: 'unitNumber', message: 'Unit / apartment number', section: 'addresses' });
    }
    return issues;
  };

  const sectionHasIssue = (section) => validationIssues.some((issue) => issue.section === section);
  const fieldHasIssue = (key) => validationIssues.some((issue) => issue.key === key);

  const standaloneStepIssues = (step) => {
    const issues = collectValidationIssues();
    if (step === 0) return issues.filter((issue) => issue.section === 'contact');
    if (step === 1) return issues.filter((issue) => issue.key === 'businessName');
    if (step === 2) {
      const businessIssues = [];
      if (tradingChannels.length === 0) {
        businessIssues.push({ key: 'tradingChannels', message: 'How you trade', section: 'business' });
      }
      if (productCategories.length === 0) {
        businessIssues.push({ key: 'productCategories', message: 'What you sell', section: 'business' });
      }
      if (productCategories.includes('Other') && !otherProductCategory.trim()) {
        businessIssues.push({ key: 'otherProductCategory', message: 'Name the other product category', section: 'business' });
      }
      if (businessDescription.trim().length < 20) {
        businessIssues.push({ key: 'businessDescription', message: 'Business description (at least 20 characters)', section: 'business' });
      }
      return businessIssues;
    }
    if (step === 3) return issues.filter((issue) => issue.section === 'addresses');
    return issues;
  };

  const canAdvanceStandalone = () => standaloneStepIssues(standaloneStep).length === 0;

  const checkEmailAvailability = async () => {
    const normalized = email.trim().toLowerCase();
    const validationError = validateEmailField(normalized);
    setEmailError(validationError);
    if (validationError) {
      setEmailCheck({ status: 'idle', checkedEmail: '', message: '' });
      return false;
    }
    if (emailCheck.checkedEmail === normalized && emailCheck.status === 'available') return true;
    if (emailCheck.checkedEmail === normalized && emailCheck.status === 'existing') return false;
    const sequence = ++emailCheckSequence.current;
    setEmailCheck({ status: 'checking', checkedEmail: normalized, message: 'Checking your emailâ€¦' });
    try {
      const result = await checkRegistrationEmail(normalized);
      if (sequence !== emailCheckSequence.current) return false;
      if (result.exists) {
        setEmailCheck({ status: 'existing', checkedEmail: normalized, message: 'This email is already registered.' });
        return false;
      }
      setEmailCheck({ status: 'available', checkedEmail: normalized, message: 'Email available â€” continue your application.' });
      return true;
    } catch (error) {
      if (sequence !== emailCheckSequence.current) return false;
      setEmailCheck({ status: 'error', checkedEmail: normalized, message: error.message });
      return false;
    }
  };

  const advanceStandalone = async () => {
    if (standaloneStep === 0) {
      if (!(await checkEmailAvailability())) return;
    }

    const issues = standaloneStepIssues(standaloneStep);
    if (issues.length > 0) {
      setValidationIssues(issues);
      setSubmitError('');
      return;
    }
    setValidationIssues([]);
    setSubmitError('');
    if (standaloneStep < STANDALONE_STEPS.length - 1) {
      setStandaloneStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBackStandalone = () => {
    setValidationIssues([]);
    setSubmitError('');
    setStandaloneStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (standalone && standaloneStep < STANDALONE_STEPS.length - 1) {
      await advanceStandalone();
      return;
    }

    const issues = collectValidationIssues();
    if (issues.length > 0) {
      setValidationIssues(issues);
      setSubmitError('');
      if (standalone) {
        const stepForSection = {
          contact: 0,
          businessName: 1,
          tradingChannels: 2,
          productCategories: 2,
          otherProductCategory: 2,
          businessDescription: 2,
          addresses: 3,
          country: 3,
          billingStreet: 3,
          billingSuburb: 3,
          billingPostalCode: 3,
          billingCity: 3,
          streetName: 3,
          suburb: 3,
          postalCode: 3,
          city: 3,
          buildingType: 3,
          otherBuildingType: 3,
          unitNumber: 3,
        };
        setStandaloneStep(stepForSection[issues[0].key] ?? stepForSection[issues[0].section] ?? 0);
      } else {
        const firstSection = document.getElementById(`register-section-${issues[0].section}`);
        firstSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setValidationIssues([]);
    setEmailError('');
    setSubmitting(true);
    setSubmitError('');
    setShowAccountRecovery(false);
    try {
      const deliveryLine = resolvedDeliveryAddress();
      const result = await submitTradeApplication({
        email: email.trim(),
        password,
        confirmPassword,
        contactName: contactName.trim(),
        businessName: businessName.trim(),
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
        company_fax: companyFax,
      });
      setCustomerCode(result?.customerCode || result?.profile?.customerCode || '');
      setInstantAccess(Boolean(result?.instantAccess));
      setNotificationSent(result?.notificationSent === true);
      setDone(true);
    } catch (submitErr) {
      setSubmitError(submitErr.message || 'Something went wrong. Please try again.');
      setShowAccountRecovery(submitErr.recovery === 'SIGN_IN_OR_RESET_PASSWORD');
    } finally {
      setSubmitting(false);
    }
  };

  const registerCard = (
    <div className="lp-register-card">
            {done ? (
              <div className="lp-quiz-success">
                <CheckCircle2 size={48} />
                <h3>{instantAccess ? 'You\'re approved' : 'Application received'}</h3>
                <p>
                  {instantAccess
                    ? <>Welcome back, {contactName.trim()}. Your trade account is approved{customerCode ? ` (customer code ${customerCode})` : ''} â€” sign in with {email.trim()} to access the catalogue.</>
                    : <>Thank you, {contactName.trim()}. Proto is reviewing your application and we will notify {email.trim()} when you have been approved.</>}
                </p>
                {!notificationSent && (
                  <p className="lp-quiz-error" role="alert">
                    Your application was saved, but we could not confirm the email notification. Please contact online@proto.co.za if you do not hear from us.
                  </p>
                )}
                {!standalone && (
                  <button type="button" onClick={onLogin}>
                    Go to sign in
                  </button>
                )}
              </div>
            ) : (
              <form id="trade-registration-form" className="lp-register-form" onSubmit={handleSubmit} noValidate>
                <input
                  type="text"
                  name="company_fax"
                  value={companyFax}
                  onChange={(e) => setCompanyFax(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="lp-register-honeypot"
                />

                {standalone && (
                  <div className="lp-register-stepper" aria-label="Registration progress">
                    {STANDALONE_STEPS.map((label, index) => (
                      <div
                        key={label}
                        className={`lp-register-stepper-seg${index <= standaloneStep ? ' active' : ''}${index === standaloneStep ? ' current' : ''}`}
                      />
                    ))}
                  </div>
                )}

                {(!standalone || standaloneStep === 0) && (
                <section
                  id="register-section-contact"
                  className={`lp-register-section${sectionHasIssue('contact') ? ' lp-register-section--missing' : ''}`}
                >
                  {standalone && (
                    <div className="lp-register-step-intro">
                      <h2>Your contact details</h2>
                      <p>Start with the person we&apos;ll reach on this account.</p>
                    </div>
                  )}
                  {!standalone && <h2>Contact details</h2>}
                  <div className="lp-register-grid">
                    <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('contactName') ? ' lp-quiz-field--error' : ''}`}>
                      <label htmlFor="register-contact-name">Contact person name and surname</label>
                      <input
                        id="register-contact-name"
                        name="contact-name"
                        autoComplete="name"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Full contact name"
                        required
                        aria-required="true"
                        aria-invalid={fieldHasIssue('contactName')}
                      />
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('email') ? ' lp-quiz-field--error' : ''}`}>
                      <label htmlFor="register-email">Email address</label>
                      <input
                        id="register-email"
                        name="email"
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          emailCheckSequence.current += 1;
                          setEmail(e.target.value);
                          if (emailError) setEmailError('');
                          setEmailCheck({ status: 'idle', checkedEmail: '', message: '' });
                        }}
                        onBlur={() => { if (email.trim()) void checkEmailAvailability(); }}
                        placeholder="name@business.co.za"
                        aria-invalid={!!emailError || fieldHasIssue('email')}
                        aria-describedby={emailError ? 'register-email-error' : undefined}
                        required
                        aria-required="true"
                      />
                      {emailError && <span id="register-email-error" className="lp-register-field-error">{emailError}</span>}
                      {!emailError && emailCheck.status !== 'idle' && (
                        <div className={`lp-register-email-status lp-register-email-status--${emailCheck.status}`} role="status" aria-live="polite">
                          <span>{emailCheck.message}</span>
                          {emailCheck.status === 'existing' && onLogin && (
                            <div className="lp-register-recovery-actions">
                              <button type="button" className="lp-register-recovery-action" onClick={() => onLogin({ initialEmail: email.trim(), initialMode: 'login' })}>Sign in</button>
                              <button type="button" className="lp-register-recovery-action" onClick={() => onLogin({ initialEmail: email.trim(), initialMode: 'forgot' })}>Reset password</button>
                            </div>
                          )}
                          {emailCheck.status === 'error' && (
                            <button type="button" className="lp-register-email-retry" onClick={() => void checkEmailAvailability()}>Try again</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('phone') ? ' lp-quiz-field--error' : ''}`}>
                      <label htmlFor="register-phone">Phone number</label>
                      <input
                        id="register-phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+27"
                        required
                        aria-required="true"
                        aria-invalid={fieldHasIssue('phone')}
                      />
                    </div>
                    {phone.replace(/\D/g, '').length >= 8 && (
                      <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('whatsapp') ? ' lp-quiz-field--error' : ''}`}>
                        <div className="lp-register-whatsapp">
                          <div className="lp-register-whatsapp-head">
                            <MessageCircle size={18} />
                            <div>
                              <strong>Can we contact you via WhatsApp?</strong>
                              <span>Get specials, stock alerts and order updates on your phone.</span>
                            </div>
                          </div>
                          <div className="lp-register-whatsapp-actions">
                            <button
                              type="button"
                              className={whatsappOptIn === true ? 'selected yes' : ''}
                              onClick={() => setWhatsappOptIn(true)}
                              aria-pressed={whatsappOptIn === true}
                            >
                              {whatsappOptIn === true ? 'âœ“ Yes, send updates' : 'Yes, send updates'}
                            </button>
                            <button
                              type="button"
                              className={whatsappOptIn === false ? 'selected no' : ''}
                              onClick={() => setWhatsappOptIn(false)}
                              aria-pressed={whatsappOptIn === false}
                            >
                              {whatsappOptIn === false ? 'âœ“ No WhatsApp updates' : 'No WhatsApp updates'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className={`lp-quiz-field${fieldHasIssue('password') ? ' lp-quiz-field--error' : ''}`}>
                      <label htmlFor="register-password">Password <span className="lp-register-optional">(min. {MIN_PASSWORD_LENGTH} characters)</span></label>
                      <div className="lp-quiz-pw-wrap">
                        <input
                          type={showPw ? 'text' : 'password'}
                          id="register-password"
                          name="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                          required
                          aria-required="true"
                          aria-invalid={fieldHasIssue('password')}
                          minLength={MIN_PASSWORD_LENGTH}
                        />
                        <button type="button" className="lp-quiz-pw-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                          {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('confirmPassword') ? ' lp-quiz-field--error' : ''}`}>
                      <label htmlFor="register-confirm-password">Confirm password</label>
                      <div className="lp-quiz-pw-wrap">
                        <input
                          type={showConfirmPw ? 'text' : 'password'}
                          id="register-confirm-password"
                          name="confirm-password"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          required
                          aria-required="true"
                          aria-invalid={fieldHasIssue('confirmPassword')}
                          minLength={MIN_PASSWORD_LENGTH}
                        />
                        <button type="button" className="lp-quiz-pw-eye" onClick={() => setShowConfirmPw((s) => !s)} aria-label={showConfirmPw ? 'Hide confirmed password' : 'Show confirmed password'} aria-pressed={showConfirmPw}>
                          {showConfirmPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
                )}

                {(!standalone || standaloneStep === 1) && (
                <section
                  id="register-section-company"
                  className={`lp-register-section${sectionHasIssue('business') ? ' lp-register-section--missing' : ''}`}
                >
                  {standalone ? (
                    <div className="lp-register-step-intro">
                      <h2>Your company</h2>
                      <p>Tell us the trading name you order under.</p>
                    </div>
                  ) : (
                    <>
                      <h2>Business details</h2>
                    </>
                  )}
                  <div className="lp-register-grid">
                    <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('businessName') ? ' lp-quiz-field--error' : ''}`}>
                      <label htmlFor="register-business-name">Company / trading name</label>
                      <input
                        id="register-business-name"
                        name="business-name"
                        autoComplete="organization"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Name"
                        required
                        aria-required="true"
                        aria-invalid={fieldHasIssue('businessName')}
                      />
                    </div>
                    <div className="lp-quiz-field">
                      <label htmlFor="register-vat-number">VAT number <span className="lp-register-optional">(optional)</span></label>
                      <input
                        id="register-vat-number"
                        name="vat-number"
                        value={vatNumber}
                        onChange={(e) => setVatNumber(e.target.value)}
                        placeholder="VAT registration number"
                      />
                    </div>
                    <div className="lp-quiz-field">
                      <label htmlFor="register-website">Website or social media <span className="lp-register-optional">(optional)</span></label>
                      <input
                        id="register-website"
                        name="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="www.yourshop.co.za or @yourshop"
                      />
                    </div>
                  </div>

                  {!standalone && (
                    <>
                      <div className="lp-register-subhead">Estimated monthly spend</div>
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

                      <div id="register-trading-channel-label" className="lp-register-subhead">
                        1. How do you trade? <span className="lp-register-required">(required â€” select all that apply)</span>
                      </div>
                      <div className="lp-quiz-types" role="group" aria-labelledby="register-trading-channel-label" aria-required="true">
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
                      <div id="register-product-category-label" className="lp-register-subhead">
                        2. What do you mainly sell? <span className="lp-register-required">(required â€” select all that apply)</span>
                      </div>
                      <div className="lp-quiz-types" role="group" aria-labelledby="register-product-category-label" aria-required="true">
                        {PRODUCT_CATEGORIES.map((category) => {
                          const selected = productCategories.includes(category);
                          return (
                            <button key={category} type="button" className={`lp-quiz-type-card lp-quiz-type-card--multi${selected ? ' selected' : ''}`} onClick={() => toggleProductCategory(category)} aria-pressed={selected}>
                              <span>{category}</span>{selected && <Check size={15} strokeWidth={3} aria-hidden="true" />}
                            </button>
                          );})}
                      </div>
                      {productCategories.includes('Other') && (
                        <div className="lp-quiz-field lp-quiz-other-field">
                          <label htmlFor="register-other-product-category">Name the other product category</label>
                          <input
                            id="register-other-product-category"
                            value={otherProductCategory}
                            onChange={(e) => setOtherProductCategory(e.target.value)}
                            placeholder="For example: Florist supplies"
                            required
                          />
                        </div>
                      )}
                      <div className="lp-quiz-field" style={{ marginTop: 18 }}>
                        <label htmlFor="register-business-description">3. What do you sell, and who do you normally sell to? <span className="lp-register-required">(required)</span></label>
                        <textarea
                          id="register-business-description"
                          value={businessDescription}
                          onChange={(e) => setBusinessDescription(e.target.value.slice(0, 400))}
                          placeholder="Example: Gifts and party supplies sold from our Bellville shop to walk-in customers and event planners."
                          minLength={20}
                          maxLength={400}
                          required
                          aria-invalid={fieldHasIssue('businessDescription')}
                        />
                        <span className="lp-quiz-field-help">Minimum 20 characters Â· {businessDescription.length}/400</span>
                      </div>
                    </>
                  )}
                </section>
                )}

                {standalone && standaloneStep === 2 && (
                <section
                  id="register-section-business"
                  className={`lp-register-section lp-register-section--business-step${fieldHasIssue('tradingChannels') || fieldHasIssue('productCategories') || fieldHasIssue('otherProductCategory') ? ' lp-register-section--missing' : ''}`}
                >
                  <div className="lp-register-step-intro">
                    <h2>Tell us about your business</h2>
                    <p>This helps us give you the best wholesale experience.</p>
                  </div>
                  <BusinessCategoryPicker
                    selectedChannels={tradingChannels}
                    onToggleChannel={toggleTradingChannel}
                    selectedCategories={productCategories}
                    onToggleCategory={toggleProductCategory}
                    otherValue={otherProductCategory}
                    onOtherChange={setOtherProductCategory}
                  />
                  <div className="lp-quiz-field" style={{ marginTop: 18 }}>
                    <label htmlFor="standalone-business-description">3. What do you sell, and who do you normally sell to? <span className="lp-register-required">(required)</span></label>
                    <textarea
                      id="standalone-business-description"
                      value={businessDescription}
                      onChange={(e) => setBusinessDescription(e.target.value.slice(0, 400))}
                      placeholder="Example: Gifts and party supplies sold from our Bellville shop to walk-in customers and event planners."
                      minLength={20}
                      maxLength={400}
                      required
                      aria-invalid={fieldHasIssue('businessDescription')}
                    />
                    <span className="lp-quiz-field-help">Minimum 20 characters Â· {businessDescription.length}/400</span>
                  </div>
                  <MonthlySpendOptional value={monthlySpend} onChange={setMonthlySpend} />
                </section>
                )}

                {(!standalone || standaloneStep === 3) && (
                <section
                  id="register-section-addresses"
                  className={`lp-register-section${sectionHasIssue('addresses') ? ' lp-register-section--missing' : ''}`}
                >
                  {standalone ? (
                    <div className="lp-register-step-intro">
                      <h2>Your addresses</h2>
                      <p>Billing and delivery details for orders.</p>
                    </div>
                  ) : (
                    <h2>Addresses</h2>
                  )}
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
                    fieldHasIssue={fieldHasIssue}
                  />
                </section>
                )}

                {validationIssues.length > 0 && (
                  <div className="lp-register-validation-summary" role="alert" aria-live="polite">
                    <strong>Please complete the following before submitting:</strong>
                    <ul>
                      {validationIssues.map((issue) => (
                        <li key={issue.key}>{issue.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {submitError && (
                  <div className="lp-quiz-error" role="alert">
                    <span>{submitError}</span>
                    {showAccountRecovery && onLogin && (
                      <button type="button" className="lp-register-recovery-action" onClick={() => onLogin({ initialEmail: email.trim() })}>
                        Sign in or reset password
                      </button>
                    )}
                  </div>
                )}

                {standalone ? (
                  <div className="lp-register-step-actions">
                    {standaloneStep > 0 ? (
                      <button type="button" className="lp-register-step-back" onClick={goBackStandalone} disabled={submitting}>
                        <ArrowLeft size={16} />
                        Back
                      </button>
                    ) : <span />}
                    <button
                      type="submit"
                      className="lp-register-step-continue"
                      disabled={submitting || emailCheck.status === 'checking' || emailCheck.status === 'existing' || !canAdvanceStandalone()}
                    >
                      {submitting
                        ? 'Submitting your applicationâ€¦'
                        : standaloneStep < STANDALONE_STEPS.length - 1
                          ? 'Continue'
                          : 'Submit trade application'}
                      {!submitting && standaloneStep < STANDALONE_STEPS.length - 1 && <ArrowRight size={16} />}
                    </button>
                  </div>
                ) : (
                <div className="lp-register-actions">
                  <button type="submit" className="lp-register-submit" disabled={submitting}>
                    {submitting ? 'Submitting your applicationâ€¦' : 'Submit trade application'}
                  </button>
                  {!standalone && (
                    <p className="lp-register-footnote">
                      Already have an account?{' '}
                      <button type="button" className="lp-register-link" onClick={onLogin}>Sign in</button>
                    </p>
                  )}
                </div>
                )}
                {standalone && (
                  <p className="lp-register-step-footnote">You can update your details anytime</p>
                )}
              </form>
            )}
    </div>
  );

  const registrationBanner = (
    <div className={standalone ? 'lp-register-standalone-banner' : 'lp-register-route-banner'}>
      <button
        type="button"
        className="lp-register-banner-action"
        aria-label="Existing customers must re-register. New customers can apply for Proto Trading Online access. Online approval does not create an account at our physical store. Go to the registration form."
        onClick={() => document.getElementById('trade-registration-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        <img
          src="/register-reregister-banner.webp?v=2"
          alt="Welcome to the new Proto Trading Online. Existing customers must re-register. New customers can apply for online access. Online approval does not create an account at our physical store."
          fetchPriority="high"
          decoding="async"
        />
      </button>
    </div>
  );

  return (
    <div className={`lp-register-page${standalone ? ' lp-register-page--standalone' : ''}`}>
      {!standalone && (
        <header className="lp-register-header">
          <a href="/" className="lp-register-brand" aria-label="Proto Trading home">
            <ProtoLogo variant="full" size="lg" tagline={false} />
          </a>
          <button type="button" className="lp-register-login" onClick={onLogin}>
            <Lock size={15} />
            Sign in
          </button>
        </header>
      )}

      <main className={`lp-register-main${standalone ? ' lp-register-main-standalone' : ''}`}>
        {standalone ? (
          <div className="lp-register-standalone-panel">
            {standaloneStep === 0 && registrationBanner}
            <div className="lp-register-standalone-body">
              {registerCard}
            </div>
          </div>
        ) : (
          <>
            {registrationBanner}
            <div className="lp-register-shell">
              <div className="lp-register-intro">
                <span className="lp-eyebrow lp-eyebrow-light">Trade registration</span>
                <h1>Re-register or apply for Proto Trading Online access</h1>
                <p>
                  Existing customers must re-register for the new online website.
                  New customers can apply for online purchasing access. Approval gives
                  access to Proto Trading Online only and does not create an account
                  for purchases at our physical store.
                </p>
                <ul className="lp-apply-list">
                  <li>Existing customers must re-register for the new website</li>
                  <li>New applications are reviewed before online access is approved</li>
                  <li>Live stock, trade pricing, and online ordering</li>
                </ul>
              </div>
              {registerCard}
            </div>
          </>
        )}
      </main>

      <footer className="lp-register-footer">
        <p>Trade access only. Not open to the general public.</p>
        {!standalone && <a href="/">Back to homepage</a>}
      </footer>
    </div>
  );
}


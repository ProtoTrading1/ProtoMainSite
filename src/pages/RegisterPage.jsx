import { useState } from 'react';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { CheckCircle2, Eye, EyeOff, Lock, MessageCircle } from 'lucide-react';
import { submitTradeApplication } from '../lib/tradeApplication';
import '../landing.css';

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
  'Craft & bead shop',
  'Packaging supplier',
  'Gift shop',
  'Educational supplier',
  'Religious / church store',
  'Promotional products',
  'Other',
];

const BUILDING_TYPES = ['Office Building', 'Apartments', 'House'];

const MONTHLY_SPEND_BANDS = [
  'R0 – R5,000',
  'R5,000 – R10,000',
  'R10,000 – R25,000',
  'R25,000 – R50,000',
  'R50,000+',
];

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
  const [businessType, setBusinessType] = useState([]);
  const [otherType, setOtherType] = useState('');
  const [monthlySpend, setMonthlySpend] = useState('');
  const [otherBuildingType, setOtherBuildingType] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [streetName, setStreetName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [companyFax, setCompanyFax] = useState('');

  const [emailError, setEmailError] = useState('');
  const [validationIssues, setValidationIssues] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [customerCode, setCustomerCode] = useState('');

  const toggleBusinessType = (t) =>
    setBusinessType((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleCompanyAddressChange = (v) => {
    setCompanyAddress(v);
  };

  const resolvedBuildingType = () => (
    buildingType === 'Other' ? otherBuildingType.trim() : buildingType
  );

  const buildStructuredDeliveryAddress = () => {
    const parts = [streetName.trim(), suburb.trim(), postalCode.trim()];
    const bt = resolvedBuildingType();
    if (bt) parts.push(bt);
    if (buildingType === 'Apartments' && unitNumber.trim()) {
      parts.push(`Unit ${unitNumber.trim()}`);
    }
    return parts.filter(Boolean).join(', ').toUpperCase();
  };

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
    if (password.trim().length < 8) {
      issues.push({ key: 'password', message: 'Password (minimum 8 characters)', section: 'contact' });
    }
    if (confirmPassword.trim().length < 8) {
      issues.push({ key: 'confirmPassword', message: 'Confirm password', section: 'contact' });
    }
    if (password.trim() && confirmPassword.trim() && password !== confirmPassword) {
      issues.push({ key: 'confirmPassword', message: 'Passwords must match', section: 'contact' });
    }
    if (typeof whatsappOptIn !== 'boolean') {
      issues.push({ key: 'whatsapp', message: 'WhatsApp question — choose Yes or No', section: 'contact' });
    }
    if (!businessName.trim()) {
      issues.push({ key: 'businessName', message: 'Company / trading name', section: 'business' });
    }
    if (!country.trim()) {
      issues.push({ key: 'country', message: 'Country', section: 'location' });
    }
    if (!companyAddress.trim()) {
      issues.push({ key: 'companyAddress', message: 'Full company address', section: 'addresses' });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const issues = collectValidationIssues();
    if (issues.length > 0) {
      setValidationIssues(issues);
      setSubmitError('');
      const firstSection = document.getElementById(`register-section-${issues[0].section}`);
      firstSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setValidationIssues([]);
    setEmailError('');
    setSubmitting(true);
    setSubmitError('');
    try {
      const deliveryLine = resolvedDeliveryAddress();
      const result = await submitTradeApplication({
        email: email.trim(),
        password,
        confirmPassword,
        contactName: contactName.trim(),
        businessName: businessName.trim(),
        phone: phone.trim(),
        companyAddress: companyAddress.trim(),
        deliveryAddress: deliveryLine,
        streetName: streetName.trim(),
        suburb: suburb.trim(),
        postalCode: postalCode.trim(),
        buildingType: resolvedBuildingType(),
        unitNumber: buildingType === 'Apartments' ? unitNumber.trim() : '',
        vatNumber: vatNumber.trim() || null,
        country: country || null,
        province: province || null,
        city: city.trim() || null,
        businessType: businessType
          .map((t) => (t === 'Other' ? otherType.trim() : t))
          .filter(Boolean)
          .join(', ') || null,
        monthlySpend: monthlySpend || null,
        website: website.trim() || null,
        acceptWhatsapp: typeof whatsappOptIn === 'boolean' ? whatsappOptIn : null,
        instantApproval: true,
        company_fax: companyFax,
      });
      setCustomerCode(result?.customerCode || result?.profile?.customerCode || '');
      setDone(true);
    } catch (submitErr) {
      setSubmitError(submitErr.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const registerCard = (
    <div className="lp-register-card">
            {done ? (
              <div className="lp-quiz-success">
                <CheckCircle2 size={48} />
                <h3>You&apos;re approved</h3>
                <p>
                  Welcome, {contactName.trim()}. Your trade account is live
                  {customerCode ? ` (customer code ${customerCode})` : ''}.
                  {standalone
                    ? ' You will receive confirmation by email with next steps.'
                    : ` Log in with ${email.trim()} to start ordering.`}
                </p>
                {!standalone && (
                  <button type="button" onClick={onLogin}>
                    Log in now
                  </button>
                )}
              </div>
            ) : (
              <form className="lp-register-form" onSubmit={handleSubmit} noValidate>
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

                <section
                  id="register-section-contact"
                  className={`lp-register-section${sectionHasIssue('contact') ? ' lp-register-section--missing' : ''}`}
                >
                  <h2>Contact details</h2>
                  <div className="lp-register-grid">
                    <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('contactName') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Contact person name and surname</label>
                      <input
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Full contact name"
                        required
                      />
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('email') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Email address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                        onBlur={() => setEmailError(email.trim() ? validateEmailField(email) : '')}
                        placeholder="name@business.co.za"
                        aria-invalid={!!emailError}
                        required
                      />
                      {emailError && <span className="lp-register-field-error">{emailError}</span>}
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('phone') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Phone number</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+27"
                        required
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
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className={whatsappOptIn === false ? 'selected no' : ''}
                              onClick={() => setWhatsappOptIn(false)}
                            >
                              No
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className={`lp-quiz-field${fieldHasIssue('password') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Password <span className="lp-register-optional">(min. 8 characters)</span></label>
                      <div className="lp-quiz-pw-wrap">
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          required
                          minLength={8}
                        />
                        <button type="button" className="lp-quiz-pw-eye" onClick={() => setShowPw((s) => !s)}>
                          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('confirmPassword') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Confirm password</label>
                      <div className="lp-quiz-pw-wrap">
                        <input
                          type={showConfirmPw ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          required
                          minLength={8}
                        />
                        <button type="button" className="lp-quiz-pw-eye" onClick={() => setShowConfirmPw((s) => !s)}>
                          {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  id="register-section-business"
                  className={`lp-register-section${sectionHasIssue('business') ? ' lp-register-section--missing' : ''}`}
                >
                  <h2>Business details</h2>
                  <div className="lp-register-grid">
                    <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('businessName') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Company / trading name</label>
                      <input
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="name"
                        required
                      />
                    </div>
                    <div className="lp-quiz-field">
                      <label>VAT number <span className="lp-register-optional">(optional)</span></label>
                      <input
                        value={vatNumber}
                        onChange={(e) => setVatNumber(e.target.value)}
                        placeholder="VAT registration number"
                      />
                    </div>
                    <div className="lp-quiz-field">
                      <label>Website or social media <span className="lp-register-optional">(optional)</span></label>
                      <input
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="www.yourshop.co.za or @yourshop"
                      />
                    </div>
                  </div>

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

                  <div className="lp-register-subhead">Business category <span className="lp-register-optional">(select all that apply)</span></div>
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
                    <div className="lp-quiz-field lp-quiz-other-field">
                      <label>Describe your business</label>
                      <input
                        value={otherType}
                        onChange={(e) => setOtherType(e.target.value)}
                        placeholder="Tell us what type of business you run"
                      />
                    </div>
                  )}
                </section>

                <section
                  id="register-section-location"
                  className={`lp-register-section${sectionHasIssue('location') ? ' lp-register-section--missing' : ''}`}
                >
                  <h2>Location</h2>
                  <div className="lp-register-subhead">Country</div>
                  <div className={`lp-quiz-countries${fieldHasIssue('country') ? ' lp-quiz-field--error' : ''}`}>
                    {SADC_COUNTRIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`lp-quiz-country${country === c ? ' selected' : ''}`}
                        onClick={() => {
                          setCountry(c);
                          if (c !== 'South Africa') setProvince('');
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {country === 'South Africa' && (
                    <div className="lp-register-grid lp-register-sa-fields">
                      <div className="lp-quiz-field">
                        <label>Province</label>
                        <select
                          value={province}
                          onChange={(e) => {
                            setProvince(e.target.value);
                            if (e.target.value) setCountry('South Africa');
                          }}
                        >
                          <option value="">Select province</option>
                          {SA_PROVINCES.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      <div className="lp-quiz-field">
                        <label>City / town</label>
                        <input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="City or town"
                        />
                      </div>
                    </div>
                  )}
                  {country && country !== 'South Africa' && (
                    <div className="lp-quiz-field">
                      <label>City / town</label>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City or town"
                      />
                    </div>
                  )}
                </section>

                <section
                  id="register-section-addresses"
                  className={`lp-register-section${sectionHasIssue('addresses') ? ' lp-register-section--missing' : ''}`}
                >
                  <h2>Addresses</h2>
                  <div className="lp-register-grid">
                    <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('companyAddress') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Full company address</label>
                      <AddressAutocomplete
                        value={companyAddress}
                        onChange={handleCompanyAddressChange}
                        placeholder="Start typing your street address…"
                      />
                    </div>
                    <div className="lp-register-subhead">Delivery address</div>
                    <div className={`lp-quiz-field${fieldHasIssue('streetName') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Street name</label>
                      <input
                        value={streetName}
                        onChange={(e) => setStreetName(e.target.value)}
                        placeholder="Street name and number"
                        required
                      />
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('suburb') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Suburb</label>
                      <input
                        value={suburb}
                        onChange={(e) => setSuburb(e.target.value)}
                        placeholder="Suburb"
                        required
                      />
                    </div>
                    <div className={`lp-quiz-field${fieldHasIssue('postalCode') ? ' lp-quiz-field--error' : ''}`}>
                      <label>Postal code</label>
                      <input
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="Postal code"
                        required
                      />
                    </div>
                    <div className="lp-quiz-field lp-quiz-field--full">
                      <div className="lp-register-subhead">Building type</div>
                      <div className={`lp-quiz-types lp-quiz-types--compact${fieldHasIssue('buildingType') ? ' lp-quiz-field--error' : ''}`}>
                        {BUILDING_TYPES.map((type) => (
                          <button
                            key={type}
                            type="button"
                            className={`lp-quiz-type-card${buildingType === type ? ' selected' : ''}`}
                            onClick={() => {
                              setBuildingType(type);
                              if (type !== 'Apartments') setUnitNumber('');
                              if (type !== 'Other') setOtherBuildingType('');
                            }}
                          >
                            {type}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={`lp-quiz-type-card${buildingType === 'Other' ? ' selected' : ''}`}
                          onClick={() => {
                            setBuildingType('Other');
                            setUnitNumber('');
                          }}
                        >
                          Other
                        </button>
                      </div>
                    </div>
                    {buildingType === 'Other' && (
                      <div className={`lp-quiz-field${fieldHasIssue('otherBuildingType') ? ' lp-quiz-field--error' : ''}`}>
                        <label>Describe building type</label>
                        <input
                          value={otherBuildingType}
                          onChange={(e) => setOtherBuildingType(e.target.value)}
                          placeholder="e.g. Warehouse, Industrial unit"
                          required
                        />
                      </div>
                    )}
                    {buildingType === 'Apartments' && (
                      <div className={`lp-quiz-field${fieldHasIssue('unitNumber') ? ' lp-quiz-field--error' : ''}`}>
                        <label>Unit / apartment number</label>
                        <input
                          value={unitNumber}
                          onChange={(e) => setUnitNumber(e.target.value)}
                          placeholder="Unit number"
                          required
                        />
                      </div>
                    )}
                  </div>
                </section>

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

                {submitError && <div className="lp-quiz-error">{submitError}</div>}

                <div className="lp-register-actions">
                  <button type="submit" className="lp-register-submit" disabled={submitting}>
                    {submitting ? 'Creating your account…' : 'Create trade account'}
                  </button>
                  {!standalone && (
                    <p className="lp-register-footnote">
                      Already have an account?{' '}
                      <button type="button" className="lp-register-link" onClick={onLogin}>Log in</button>
                    </p>
                  )}
                </div>
              </form>
            )}
    </div>
  );

  return (
    <div className={`lp-register-page${standalone ? ' lp-register-page--standalone' : ''}`}>
      {!standalone && (
        <header className="lp-register-header">
          <a href="/" className="lp-register-brand" aria-label="Proto Trading home">
            <img src="/proto-logo.webp" alt="" />
            <div>
              <strong>PROTO <span>TRADING</span></strong>
              <small>Wholesale trade portal</small>
            </div>
          </a>
          <button type="button" className="lp-register-login" onClick={onLogin}>
            <Lock size={15} />
            Log in
          </button>
        </header>
      )}

      <main className={`lp-register-main${standalone ? ' lp-register-main-standalone' : ''}`}>
        {standalone ? (
          <div className="lp-register-standalone-panel">
            <div className="lp-register-standalone-banner">
              <img
                src="/pre-register-banner.jpg"
                alt="Your exclusive invitation — complete your Proto Trading account and enjoy 7.5% off your first online order with code PROTO75"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="lp-register-standalone-body">
              {registerCard}
            </div>
          </div>
        ) : (
          <div className="lp-register-shell">
            <div className="lp-register-intro">
              <span className="lp-eyebrow lp-eyebrow-light">Trade registration</span>
              <h1>Open your wholesale trade account</h1>
              <p>
                Register once to access live stock, trade pricing, and our full catalogue.
                Approved accounts can log in immediately after signup.
              </p>
              <ul className="lp-apply-list">
                <li>Instant approval for new trade customers</li>
                <li>Live stock checks on every product</li>
                <li>Order builder with PDF quote requests</li>
              </ul>
            </div>
            {registerCard}
          </div>
        )}
      </main>

      <footer className="lp-register-footer">
        <p>Trade access only. Not open to the general public.</p>
        {!standalone && <a href="/">Back to homepage</a>}
      </footer>
    </div>
  );
}

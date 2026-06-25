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

export default function RegisterPage({ onLogin }) {
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
  const [vatNumber, setVatNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [sameAddress, setSameAddress] = useState(false);
  const [companyFax, setCompanyFax] = useState('');

  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [customerCode, setCustomerCode] = useState('');

  const toggleBusinessType = (t) =>
    setBusinessType((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleCompanyAddressChange = (v) => {
    setCompanyAddress(v);
    if (sameAddress) setDeliveryAddress(v);
  };

  const handleSameAddressToggle = (checked) => {
    setSameAddress(checked);
    if (checked) setDeliveryAddress(companyAddress);
  };

  const canSubmit = () => {
    const phoneOk = phone.replace(/\D/g, '').length >= 8;
    const whatsappAnswered = typeof whatsappOptIn === 'boolean';
    const passwordsMatch = password === confirmPassword;
    return (
      contactName.trim()
      && businessName.trim()
      && email.trim()
      && !validateEmailField(email)
      && phoneOk
      && password.trim().length >= 8
      && confirmPassword.trim().length >= 8
      && passwordsMatch
      && whatsappAnswered
      && companyAddress.trim()
      && (sameAddress || deliveryAddress.trim())
      && country.trim()
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateEmailField(email);
    setEmailError(err);
    if (err) return;
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }
    if (!canSubmit()) {
      setSubmitError('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submitTradeApplication({
        email: email.trim(),
        password,
        confirmPassword,
        contactName: contactName.trim(),
        businessName: businessName.trim(),
        phone: phone.trim(),
        companyAddress: companyAddress.trim(),
        deliveryAddress: (sameAddress ? companyAddress : deliveryAddress).trim(),
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

  return (
    <div className="lp-register-page">
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

      <main className="lp-register-main">
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

          <div className="lp-register-card">
            {done ? (
              <div className="lp-quiz-success">
                <CheckCircle2 size={48} />
                <h3>You&apos;re approved</h3>
                <p>
                  Welcome, {contactName.trim()}. Your trade account is live
                  {customerCode ? ` (customer code ${customerCode})` : ''}.
                  Log in with {email.trim()} to start ordering.
                </p>
                <button type="button" onClick={onLogin}>Log in now</button>
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

                <section className="lp-register-section">
                  <h2>Contact details</h2>
                  <div className="lp-register-grid">
                    <div className="lp-quiz-field lp-quiz-field--full">
                      <label>Contact person name and surname</label>
                      <input
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Full contact name"
                        required
                      />
                    </div>
                    <div className="lp-quiz-field">
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
                    <div className="lp-quiz-field">
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
                      <div className="lp-quiz-field lp-quiz-field--full">
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
                    <div className="lp-quiz-field">
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
                    <div className="lp-quiz-field">
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

                <section className="lp-register-section">
                  <h2>Business details</h2>
                  <div className="lp-register-grid">
                    <div className="lp-quiz-field lp-quiz-field--full">
                      <label>Company / trading name</label>
                      <input
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Registered company name"
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

                <section className="lp-register-section">
                  <h2>Location</h2>
                  <div className="lp-register-subhead">Country</div>
                  <div className="lp-quiz-countries">
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
                        <select value={province} onChange={(e) => setProvince(e.target.value)}>
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

                <section className="lp-register-section">
                  <h2>Addresses</h2>
                  <div className="lp-register-grid">
                    <div className="lp-quiz-field lp-quiz-field--full">
                      <label>Full company address</label>
                      <AddressAutocomplete
                        value={companyAddress}
                        onChange={handleCompanyAddressChange}
                        placeholder="Start typing your street address…"
                      />
                    </div>
                    <label className="lp-quiz-checkbox lp-register-checkbox">
                      <input
                        type="checkbox"
                        checked={sameAddress}
                        onChange={(e) => handleSameAddressToggle(e.target.checked)}
                      />
                      Delivery address is the same as my company address
                    </label>
                    {!sameAddress && (
                      <div className="lp-quiz-field lp-quiz-field--full">
                        <label>Full delivery address</label>
                        <AddressAutocomplete
                          value={deliveryAddress}
                          onChange={setDeliveryAddress}
                          placeholder="Start typing delivery address…"
                        />
                      </div>
                    )}
                  </div>
                </section>

                {submitError && <div className="lp-quiz-error">{submitError}</div>}

                <div className="lp-register-actions">
                  <button type="submit" className="lp-register-submit" disabled={submitting || !canSubmit()}>
                    {submitting ? 'Creating your account…' : 'Create trade account'}
                  </button>
                  <p className="lp-register-footnote">
                    Already have an account?{' '}
                    <button type="button" className="lp-register-link" onClick={onLogin}>Log in</button>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="lp-register-footer">
        <p>Trade access only. Not open to the general public.</p>
        <a href="/">Back to homepage</a>
      </footer>
    </div>
  );
}

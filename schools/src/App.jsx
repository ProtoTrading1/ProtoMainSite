import { useMemo, useRef, useState } from 'react';
import {
  PROVINCES,
  ROLE_SUGGESTIONS,
  SUPPLY_NEEDS,
  MIN_PASSWORD_LENGTH,
  emailError,
  passwordPolicyError,
  phoneError,
} from './lib/schoolFields';
import { submitSchoolRegistration } from './lib/submitSchoolRegistration';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  EyeIcon,
  LockIcon,
  SchoolIcon,
} from './icons';

const BENEFITS = [
  'Browse the full Proto Trading Online range whenever you need it.',
  'Create one school account for stationery, art and classroom supplies.',
  'Order online at a time that works for your school.',
];

/** Field id -> human label, used by the error summary at the top of the form. */
const FIELD_LABELS = {
  schoolName: 'School name',
  streetAddress: 'Street address',
  suburb: 'Suburb',
  city: 'City or town',
  postalCode: 'Postal code',
  province: 'Province',
  contactName: 'Contact name',
  schoolRole: 'Role at the school',
  email: 'Work email',
  phone: 'Phone number',
  password: 'Create password',
  confirmPassword: 'Confirm password',
  authorised: 'Authorisation confirmation',
};

export default function App() {
  const [schoolName, setSchoolName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [province, setProvince] = useState('');
  const [contactName, setContactName] = useState('');
  const [schoolRole, setSchoolRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [supplyNeeds, setSupplyNeeds] = useState([]);
  const [authorised, setAuthorised] = useState(false);
  const [companyFax, setCompanyFax] = useState('');

  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  const summaryRef = useRef(null);

  const errors = useMemo(() => {
    const next = {};
    if (!schoolName.trim()) next.schoolName = 'Enter the name of your school.';
    if (!streetAddress.trim()) next.streetAddress = 'Enter the school street address.';
    if (!suburb.trim()) next.suburb = 'Enter the suburb.';
    if (!city.trim()) next.city = 'Enter the city or town.';
    if (!/^\d{4}$/.test(postalCode.trim())) next.postalCode = 'Enter a 4-digit postal code.';
    if (!province) next.province = 'Select the province your school is in.';
    if (!contactName.trim()) next.contactName = 'Enter your full name.';
    if (!schoolRole.trim()) next.schoolRole = 'Tell us your role at the school.';
    const mailError = emailError(email);
    if (mailError) next.email = mailError;
    const telError = phoneError(phone);
    if (telError) next.phone = telError;
    const pwError = passwordPolicyError(password);
    if (pwError) next.password = pwError;
    if (!confirmPassword) next.confirmPassword = 'Re-enter your password.';
    else if (confirmPassword !== password) next.confirmPassword = 'The two passwords do not match.';
    if (!authorised) next.authorised = 'Please confirm you are authorised to register this school.';
    return next;
  }, [schoolName, streetAddress, suburb, city, postalCode, province, contactName, schoolRole, email, phone, password, confirmPassword, authorised]);

  const errorKeys = Object.keys(errors);
  /* Errors surface once a field has been left, or once the form has been sent. */
  const showError = (key) => Boolean(errors[key]) && (submitted || touched[key]);
  const markTouched = (key) => setTouched((prev) => ({ ...prev, [key]: true }));

  const toggleSupplyNeed = (need) =>
    setSupplyNeeds((prev) => (prev.includes(need) ? prev.filter((item) => item !== need) : [...prev, need]));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setSubmitError('');

    if (errorKeys.length > 0) {
      window.requestAnimationFrame(() => {
        summaryRef.current?.focus();
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    setSubmitting(true);
    try {
      await submitSchoolRegistration({
        schoolName: schoolName.trim(),
        streetAddress: streetAddress.trim(),
        suburb: suburb.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        province,
        contactName: contactName.trim(),
        schoolRole: schoolRole.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirmPassword,
        supplyNeeds,
        authorised,
        company_fax: companyFax,
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitError(error.message || 'Something went wrong. Please try again.');
      window.requestAnimationFrame(() => {
        summaryRef.current?.focus();
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <header className="masthead">
        <a className="masthead-brand" href="/">
          <img src="/proto-trading-online.svg" alt="Proto Trading Online" height="30" />
        </a>
        <span className="masthead-divider" aria-hidden="true" />
        <span className="masthead-label">School supply</span>
      </header>

      <section className="hero">
        <div className="shell">
          <p className="hero-eyebrow">
            <SchoolIcon className="hero-eyebrow-icon" />
            For South African schools
          </p>
          <h1 className="hero-title">Register your school with Proto.</h1>
          <p className="hero-subtitle">Your stationery and art needs, all in one place.</p>
        </div>
      </section>

      <main className="shell layout">
        <div className="card form-card">
          {done ? (
            <div className="success" role="status">
              <CheckCircleIcon className="success-icon" />
              <h2 className="success-title">Your school is ready</h2>
              <p className="success-body">
                Thank you, {contactName.trim().split(/\s+/)[0] || 'there'}. The account for{' '}
                <strong>{schoolName.trim()}</strong> is active — no waiting for approval.
              </p>
              <p className="success-body">
                Sign in at Proto Trading Online with <strong>{email.trim()}</strong> and the password you just chose to
                browse the full range and place your first order.
              </p>
              <a className="success-cta" href="https://proto.co.za">
                Go to Proto Trading Online
                <ArrowRightIcon className="submit-icon" />
              </a>
              <p className="success-meta">Questions? Email online@proto.co.za or call +27 21 461 5883.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {/* Honeypot — hidden from people, irresistible to bots. */}
              <input
                type="text"
                name="company_fax"
                className="honeypot"
                value={companyFax}
                onChange={(e) => setCompanyFax(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              <div className="form-head">
                <div>
                  <p className="form-eyebrow">School account registration</p>
                  <h2 className="form-title">
                    Tell us about
                    <br />
                    your school.
                  </h2>
                </div>
                <span className="form-pill">2 minutes</span>
              </div>

              <div
                className="form-summary-anchor"
                ref={summaryRef}
                tabIndex={-1}
                aria-live="polite"
              >
                {submitError && (
                  <div className="alert alert--error" role="alert">
                    <AlertIcon className="alert-icon" />
                    <span>{submitError}</span>
                  </div>
                )}
                {submitted && errorKeys.length > 0 && (
                  <div className="alert alert--error" role="alert">
                    <AlertIcon className="alert-icon" />
                    <div>
                      <strong>Please check {errorKeys.length} {errorKeys.length === 1 ? 'field' : 'fields'}:</strong>
                      <ul className="alert-list">
                        {errorKeys.map((key) => (
                          <li key={key}>{FIELD_LABELS[key]}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <fieldset className="section">
                <legend className="section-title">School details</legend>
                <div className="grid">
                  <Field
                    id="school-name"
                    label="School name"
                    required
                    wide
                    error={showError('schoolName') ? errors.schoolName : ''}
                  >
                    <input
                      id="school-name"
                      name="organization"
                      autoComplete="organization"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      onBlur={() => markTouched('schoolName')}
                      placeholder="e.g. Riverside Primary School"
                      aria-invalid={showError('schoolName')}
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="section">
                <legend className="section-title">School address</legend>
                <p className="section-hint">Where we deliver your order.</p>
                <div className="grid">
                  <Field
                    id="street-address"
                    label="Street address"
                    required
                    wide
                    error={showError('streetAddress') ? errors.streetAddress : ''}
                  >
                    <input
                      id="street-address"
                      autoComplete="street-address"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      onBlur={() => markTouched('streetAddress')}
                      placeholder="e.g. 24 School Road"
                      aria-invalid={showError('streetAddress')}
                    />
                  </Field>
                  <Field
                    id="suburb"
                    label="Suburb"
                    required
                    error={showError('suburb') ? errors.suburb : ''}
                  >
                    <input
                      id="suburb"
                      autoComplete="address-level3"
                      value={suburb}
                      onChange={(e) => setSuburb(e.target.value)}
                      onBlur={() => markTouched('suburb')}
                      placeholder="e.g. Rondebosch"
                      aria-invalid={showError('suburb')}
                    />
                  </Field>
                  <Field
                    id="city"
                    label="City or town"
                    required
                    error={showError('city') ? errors.city : ''}
                  >
                    <input
                      id="city"
                      autoComplete="address-level2"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      onBlur={() => markTouched('city')}
                      placeholder="e.g. Cape Town"
                      aria-invalid={showError('city')}
                    />
                  </Field>
                  <Field
                    id="postal-code"
                    label="Postal code"
                    required
                    error={showError('postalCode') ? errors.postalCode : ''}
                  >
                    <input
                      id="postal-code"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={4}
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      onBlur={() => markTouched('postalCode')}
                      placeholder="e.g. 7700"
                      aria-invalid={showError('postalCode')}
                    />
                  </Field>
                  <Field
                    id="province"
                    label="Province"
                    required
                    error={showError('province') ? errors.province : ''}
                  >
                    <select
                      id="province"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      onBlur={() => markTouched('province')}
                      aria-invalid={showError('province')}
                    >
                      <option value="">Select province</option>
                      {PROVINCES.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </fieldset>

              <fieldset className="section">
                <legend className="section-title">Your contact details</legend>
                <div className="grid">
                  <Field
                    id="contact-name"
                    label="Contact name"
                    required
                    error={showError('contactName') ? errors.contactName : ''}
                  >
                    <input
                      id="contact-name"
                      autoComplete="name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      onBlur={() => markTouched('contactName')}
                      placeholder="Full name"
                      aria-invalid={showError('contactName')}
                    />
                  </Field>
                  <Field
                    id="school-role"
                    label="Role at the school"
                    required
                    error={showError('schoolRole') ? errors.schoolRole : ''}
                  >
                    <input
                      id="school-role"
                      list="school-role-options"
                      autoComplete="organization-title"
                      value={schoolRole}
                      onChange={(e) => setSchoolRole(e.target.value)}
                      onBlur={() => markTouched('schoolRole')}
                      placeholder="e.g. Procurement officer"
                      aria-invalid={showError('schoolRole')}
                    />
                    <datalist id="school-role-options">
                      {ROLE_SUGGESTIONS.map((role) => (
                        <option key={role} value={role} />
                      ))}
                    </datalist>
                  </Field>
                  <Field
                    id="email"
                    label="Work email"
                    required
                    error={showError('email') ? errors.email : ''}
                  >
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => markTouched('email')}
                      placeholder="name@school.co.za"
                      aria-invalid={showError('email')}
                    />
                  </Field>
                  <Field
                    id="phone"
                    label="Phone number"
                    required
                    error={showError('phone') ? errors.phone : ''}
                  >
                    <input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => markTouched('phone')}
                      placeholder="e.g. 012 345 6789"
                      aria-invalid={showError('phone')}
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="section">
                <legend className="section-title">Create your school account</legend>
                <p className="section-hint">
                  Use this email and password when you sign in to your Proto school account.
                </p>
                <div className="grid">
                  <Field
                    id="password"
                    label="Create password"
                    required
                    error={showError('password') ? errors.password : ''}
                  >
                    <div className="input-affix">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => markTouched('password')}
                        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        aria-invalid={showError('password')}
                      />
                      <button
                        type="button"
                        className="input-affix-button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-pressed={showPassword}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <EyeIcon off={showPassword} width="18" height="18" />
                      </button>
                    </div>
                  </Field>
                  <Field
                    id="confirm-password"
                    label="Confirm password"
                    required
                    error={showError('confirmPassword') ? errors.confirmPassword : ''}
                  >
                    <input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => markTouched('confirmPassword')}
                      placeholder="Re-enter your password"
                      aria-invalid={showError('confirmPassword')}
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="section">
                <legend className="section-title">Supply needs</legend>
                <p className="section-hint">
                  Interested in <span className="section-hint-note">(optional — helps us set your account up)</span>
                </p>
                <div className="chips">
                  {SUPPLY_NEEDS.map((need) => {
                    const selected = supplyNeeds.includes(need);
                    return (
                      <button
                        key={need}
                        type="button"
                        className={`chip${selected ? ' chip--selected' : ''}`}
                        onClick={() => toggleSupplyNeed(need)}
                        aria-pressed={selected}
                      >
                        {need}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className={`consent${showError('authorised') ? ' consent--error' : ''}`}>
                <input
                  id="authorised"
                  type="checkbox"
                  checked={authorised}
                  onChange={(e) => setAuthorised(e.target.checked)}
                  onBlur={() => markTouched('authorised')}
                  aria-invalid={showError('authorised')}
                  aria-describedby={showError('authorised') ? 'authorised-error' : undefined}
                />
                <label htmlFor="authorised">
                  I confirm that I&rsquo;m authorised to register this school and agree that Proto may contact us about
                  setting up and using our Proto Trading Online account.
                </label>
              </div>
              {showError('authorised') && (
                <p className="field-error" id="authorised-error">{errors.authorised}</p>
              )}

              <button type="submit" className="submit" disabled={submitting}>
                {submitting ? 'Registering your school…' : 'Register our school'}
                {!submitting && <ArrowRightIcon className="submit-icon" />}
              </button>
              <p className="submit-note">Your details are saved securely with Proto.</p>
            </form>
          )}
        </div>

        <aside className="side">
          <div className="card benefits-card">
            <p className="form-eyebrow">Why register</p>
            <h2 className="benefits-title">Everything your school needs, in one place.</h2>
            <ul className="benefits">
              {BENEFITS.map((benefit) => (
                <li key={benefit}>
                  <CheckCircleIcon className="benefit-icon" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="side-note">
            <LockIcon className="side-note-icon" />
            <span>Your details are used to set up your school&rsquo;s access to Proto Trading Online.</span>
          </p>
        </aside>
      </main>

      <footer className="footer">
        <span>Proto Trading CC &middot; De Roos Street, District Six, Cape Town</span>
        <span className="footer-links">
          <a href="mailto:online@proto.co.za">online@proto.co.za</a>
          <a href="tel:+27214615883">+27 21 461 5883</a>
        </span>
      </footer>
    </div>
  );
}

function Field({ id, label, required, error, wide = false, children }) {
  return (
    <div className={`field${wide ? ' field--wide' : ''}${error ? ' field--error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="field-required" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

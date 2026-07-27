import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import BillingDeliveryFields from './register/BillingDeliveryFields';
import { useBillingDeliveryAddresses } from '../hooks/useBillingDeliveryAddresses';

const STEP_LABELS = ['Company', 'Contact', 'Addresses', 'Additional'];

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

const toUpperTrim = (value) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : '';
};

const upperOrNull = (value) => {
  const v = toUpperTrim(value);
  return v || null;
};

export default function Questionnaire({ onLogin }) {
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
  const [businessType, setBusinessType] = useState([]);
  const [otherType, setOtherType] = useState('');
  const [monthlySpend, setMonthlySpend] = useState('');
  const [website, setWebsite] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [emailError, setEmailError] = useState('');

  const toggleBusinessType = (t) =>
    setBusinessType((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

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
      return country.trim()
        && billingOk
        && streetName.trim()
        && suburb.trim()
        && city.trim()
        && postalCode.trim()
        && buildingType
        && (buildingType !== 'Other' || otherBuildingType.trim())
        && (buildingType !== 'Apartments' || unitNumber.trim());
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
    setSubmitting(true);
    setSubmitError('');
    try {
    const { submitTradeApplication } = await import('../lib/tradeApplication');
      const result = await submitTradeApplication({
      email: email.trim(),
      password,
      contactName: toUpperTrim(contactName),
      businessName: toUpperTrim(companyName),
      phone: phone.trim(),
      companyAddress: buildStructuredBillingAddress().toUpperCase() || null,
      deliveryAddress: buildStructuredDeliveryAddress(),
      streetName: toUpperTrim(streetName),
      suburb: toUpperTrim(suburb),
      postalCode: postalCode.trim(),
      buildingType: upperOrNull(resolvedBuildingType()),
      unitNumber: buildingType === 'Apartments' ? unitNumber.trim().toUpperCase() : '',
      vatNumber: upperOrNull(vatNumber),
      country: upperOrNull(country),
      province: upperOrNull(province),
      city: billingCity.trim() ? billingCity.trim().toUpperCase() : null,
      businessType: businessType
        .map((t) => (t === 'Other' ? otherType.trim() : t))
        .filter(Boolean)
        .map((value) => value.trim().toUpperCase())
        .join(', ') || null,
      monthlySpend: monthlySpend ? monthlySpend.toUpperCase() : null,
      website: website.trim() ? website.trim().toUpperCase() : null,
      acceptWhatsapp: typeof whatsappOptIn === 'boolean' ? whatsappOptIn : null,
      customerCode: upperOrNull(customerCode),
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
        <h3>{instantAccess ? "You're approved — verify your email" : 'Application received'}</h3>
        <p>
          {instantAccess
            ? `Welcome back, ${contactName}. We sent a secure verification link to ${email.trim()}; click it before logging in to access the catalogue.`
            : `Thank you, ${contactName}. A verification email has been sent to ${email.trim()}. Please verify the address while Proto Trading reviews your application.`}
        </p>
        <button type="button" onClick={onLogin}>Go to login</button>
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
                  placeholder="name"
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

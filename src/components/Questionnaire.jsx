import { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import BillingDeliveryFields from './register/BillingDeliveryFields';
import { useBillingDeliveryAddresses } from '../hooks/useBillingDeliveryAddresses';
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';
import { PRODUCT_CATEGORIES, TRADING_CHANNELS } from '../lib/businessTypes';

const STEP_LABELS = ['Company', 'Contact', 'Addresses', 'Additional'];

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
  const [tradingChannels, setTradingChannels] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [otherProductCategory, setOtherProductCategory] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [monthlySpend, setMonthlySpend] = useState('');
  const [website, setWebsite] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [emailError, setEmailError] = useState('');

  const toggleTradingChannel = (value) =>
    setTradingChannels((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  const toggleProductCategory = (value) =>
    setProductCategories((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));

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
      return email.trim() && !validateEmailField(email) && phoneOk && !passwordPolicyError(password) && whatsappAnswered;
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
    if (step === 3) {
      return tradingChannels.length > 0
        && productCategories.length > 0
        && businessDescription.trim().length >= 20
        && (!productCategories.includes('Other') || otherProductCategory.trim());
    }
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
      salesChannels: tradingChannels,
      productCategories,
      otherProductCategory: otherProductCategory.trim() || null,
      businessType: productCategories
        .map((category) => (category === 'Other' ? otherProductCategory.trim() : category))
        .filter(Boolean)
        .map((value) => value.trim().toUpperCase())
        .join(', ') || null,
      businessDescription: businessDescription.trim(),
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
        <h3>{instantAccess ? "You're approved" : 'Application received'}</h3>
        <p>
          {instantAccess
            ? `Welcome back, ${contactName}. Your trade account is approved — sign in with ${email.trim()} to access the catalogue.`
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
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22 }}
      >
        {step === 0 && (
          <div className="lp-quiz-step">
            <h3>Start with the core company details.</h3>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label htmlFor="questionnaire-company-name">Company name</label>
                <input
                  id="questionnaire-company-name"
                  name="business-name"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Name"
                />
              </div>
              <div className="lp-quiz-field">
                <label htmlFor="questionnaire-contact-name">Contact person name and surname</label>
                <input
                  id="questionnaire-contact-name"
                  name="contact-name"
                  autoComplete="name"
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
                <label htmlFor="questionnaire-email">Email address</label>
                <input
                  id="questionnaire-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                  onBlur={() => setEmailError(email.trim() ? validateEmailField(email) : '')}
                  onKeyDown={handleKey}
                  placeholder="name@business.co.za"
                  aria-invalid={!!emailError}
                  required
                  aria-required="true"
                />
                {emailError && (
                  <span style={{ color: '#f87171', fontSize: '12.5px', marginTop: '6px', display: 'block', fontWeight: 600 }}>
                    {emailError}
                  </span>
                )}
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label htmlFor="questionnaire-phone">Phone number</label>
                <input
                  id="questionnaire-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
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
                <label htmlFor="questionnaire-password">Password <span style={{ opacity: 0.55, fontWeight: 500 }}>(min. {MIN_PASSWORD_LENGTH} characters)</span></label>
                <div className="lp-quiz-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    id="questionnaire-password"
                    name="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                    aria-required="true"
                  />
                  <button type="button" className="lp-quiz-pw-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                    {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
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
            <h3>Tell us about your business.</h3>
            <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: '13px', lineHeight: 1.6, margin: '-4px 0 18px' }}>
              Tell us how you trade, what you sell and who normally buys from you. The other details are optional.
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
            <div id="questionnaire-trading-channel-label" className="lp-quiz-question-label">
              1. How do you trade? <span>(required — select all that apply)</span>
            </div>
            <div className="lp-quiz-types" role="group" aria-labelledby="questionnaire-trading-channel-label" aria-required="true">
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
            <div id="questionnaire-product-category-label" className="lp-quiz-question-label lp-quiz-question-label--second">
              2. What do you mainly sell? <span>(required — select all that apply)</span>
            </div>
            <div className="lp-quiz-types" role="group" aria-labelledby="questionnaire-product-category-label" aria-required="true">
              {PRODUCT_CATEGORIES.map((category) => {
                const selected = productCategories.includes(category);
                return (
                  <button key={category} type="button" className={`lp-quiz-type-card lp-quiz-type-card--multi${selected ? ' selected' : ''}`} onClick={() => toggleProductCategory(category)} aria-pressed={selected}>
                    <span>{category}</span>{selected && <Check size={15} strokeWidth={3} aria-hidden="true" />}
                  </button>
                );})}
            </div>
            {productCategories.includes('Other') && (
              <motion.div
                className="lp-quiz-field lp-quiz-other-field"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label htmlFor="questionnaire-other-product-category">Name the other product category</label>
                <input
                  id="questionnaire-other-product-category"
                  value={otherProductCategory}
                  onChange={(e) => setOtherProductCategory(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="For example: Florist supplies"
                  required
                />
              </motion.div>
            )}
            <div className="lp-quiz-field" style={{ marginTop: 18 }}>
              <label htmlFor="questionnaire-business-description">3. What do you sell, and who do you normally sell to? <span style={{ opacity: 0.7 }}>(required)</span></label>
              <textarea
                id="questionnaire-business-description"
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value.slice(0, 400))}
                placeholder="Example: Gifts and party supplies sold from our Bellville shop to walk-in customers and event planners."
                minLength={20}
                maxLength={400}
                required
              />
              <span className="lp-quiz-field-help">Minimum 20 characters · {businessDescription.length}/400</span>
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

import { useState } from 'react';
import AddressAutocomplete from '../AddressAutocomplete';
import { SADC_COUNTRIES, SA_PROVINCES } from '../../lib/sadcCountries';

const BUILDING_TYPES = ['Office Building', 'Apartments', 'House'];

function StructuredAddressFields({
  street,
  setStreet,
  suburb,
  setSuburb,
  postalCode,
  setPostalCode,
  city,
  setCity,
  fieldKeys,
  fieldHasIssue,
  onKeyDown,
  locked = false,
  streetUsesAutocomplete = false,
  onPlaceSelect,
}) {
  const lockProps = locked ? { readOnly: true, 'aria-readonly': true } : {};
  const fieldClass = (key) => (
    `lp-quiz-field${fieldHasIssue(key) ? ' lp-quiz-field--error' : ''}${locked ? ' lp-quiz-field--locked' : ''}`
  );
  const inputId = (key) => `trade-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

  return (
    <>
      <div className={fieldClass(fieldKeys.street)}>
        <label htmlFor={inputId(fieldKeys.street)}>Street name</label>
        {streetUsesAutocomplete ? (
          <AddressAutocomplete
            value={street}
            id={inputId(fieldKeys.street)}
            name={fieldKeys.street}
            onChange={setStreet}
            onPlaceSelect={onPlaceSelect}
            onKeyDown={onKeyDown}
            placeholder="Street name and number"
            required
            ariaRequired="true"
            ariaInvalid={fieldHasIssue(fieldKeys.street)}
          />
        ) : (
          <input
            id={inputId(fieldKeys.street)}
            name={fieldKeys.street}
            autoComplete="street-address"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Street name and number"
            required
            aria-required="true"
            aria-invalid={fieldHasIssue(fieldKeys.street)}
            {...lockProps}
          />
        )}
      </div>
      <div className={fieldClass(fieldKeys.suburb)}>
        <label htmlFor={inputId(fieldKeys.suburb)}>Suburb</label>
        <input
          id={inputId(fieldKeys.suburb)}
          name={fieldKeys.suburb}
          autoComplete="address-level3"
          value={suburb}
          onChange={(e) => setSuburb(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Suburb"
          required
          aria-required="true"
          aria-invalid={fieldHasIssue(fieldKeys.suburb)}
          {...lockProps}
        />
      </div>
      <div className={fieldClass(fieldKeys.postalCode)}>
        <label htmlFor={inputId(fieldKeys.postalCode)}>Postal code</label>
        <input
          id={inputId(fieldKeys.postalCode)}
          name={fieldKeys.postalCode}
          autoComplete="postal-code"
          inputMode="numeric"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Postal code"
          required
          aria-required="true"
          aria-invalid={fieldHasIssue(fieldKeys.postalCode)}
          {...lockProps}
        />
      </div>
      <div className={fieldClass(fieldKeys.city)}>
        <label htmlFor={inputId(fieldKeys.city)}>City</label>
        <input
          id={inputId(fieldKeys.city)}
          name={fieldKeys.city}
          autoComplete="address-level2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="City"
          required
          aria-required="true"
          aria-invalid={fieldHasIssue(fieldKeys.city)}
          {...lockProps}
        />
      </div>
    </>
  );
}

export default function BillingDeliveryFields({
  country,
  setCountry,
  province,
  setProvince,
  billingStreet,
  setBillingStreet,
  billingSuburb,
  setBillingSuburb,
  billingPostalCode,
  setBillingPostalCode,
  billingCity,
  setBillingCity,
  onBillingPlaceSelect,
  deliverySameAsBilling,
  onDeliverySameAsBillingChange,
  streetName,
  setStreetName,
  suburb,
  setSuburb,
  postalCode,
  setPostalCode,
  city,
  setCity,
  buildingType,
  setBuildingType,
  unitNumber,
  setUnitNumber,
  otherBuildingType,
  setOtherBuildingType,
  deliveryFieldsLocked = false,
  fieldHasIssue = () => false,
  onKeyDown,
  gridClassName = 'lp-register-grid',
  subheadClassName = 'lp-register-subhead',
  buildingTypesClassName = 'lp-quiz-types lp-quiz-types--compact',
  countriesClassName = 'lp-quiz-countries',
}) {
  const billingUsesAutocomplete = !country || country === 'South Africa';
  const [countryPickerOpen, setCountryPickerOpen] = useState(country !== 'South Africa');
  const showCountryPicker = countryPickerOpen || country !== 'South Africa' || fieldHasIssue('country');

  return (
    <div className={gridClassName}>
      <div className={subheadClassName}>Billing address</div>
      <p className="lp-register-field-hint lp-register-field-hint--block">
        Registered address for invoices and account records.
      </p>

      <StructuredAddressFields
        street={billingStreet}
        setStreet={setBillingStreet}
        suburb={billingSuburb}
        setSuburb={setBillingSuburb}
        postalCode={billingPostalCode}
        setPostalCode={setBillingPostalCode}
        city={billingCity}
        setCity={setBillingCity}
        fieldKeys={{
          street: 'billingStreet',
          suburb: 'billingSuburb',
          postalCode: 'billingPostalCode',
          city: 'billingCity',
        }}
        fieldHasIssue={fieldHasIssue}
        onKeyDown={onKeyDown}
        streetUsesAutocomplete={billingUsesAutocomplete}
        onPlaceSelect={onBillingPlaceSelect}
      />

      <div className={subheadClassName}>Delivery address</div>

      <label className="lp-register-same-address" htmlFor="trade-delivery-same-as-billing">
        <input
          id="trade-delivery-same-as-billing"
          type="checkbox"
          checked={deliverySameAsBilling}
          onChange={(e) => onDeliverySameAsBillingChange(e.target.checked)}
        />
        <span>Use billing address for delivery <small>(untick to enter a different address)</small></span>
      </label>

      <StructuredAddressFields
        street={streetName}
        setStreet={setStreetName}
        suburb={suburb}
        setSuburb={setSuburb}
        postalCode={postalCode}
        setPostalCode={setPostalCode}
        city={city}
        setCity={setCity}
        fieldKeys={{
          street: 'streetName',
          suburb: 'suburb',
          postalCode: 'postalCode',
          city: 'city',
        }}
        fieldHasIssue={fieldHasIssue}
        onKeyDown={onKeyDown}
        locked={deliveryFieldsLocked}
      />

      <div className="lp-quiz-field lp-quiz-field--full">
        <div id="trade-building-type-label" className={subheadClassName}>Building type <span className="lp-register-required">(required)</span></div>
        <div className={`${buildingTypesClassName}${fieldHasIssue('buildingType') ? ' lp-quiz-field--error' : ''}`} role="group" aria-labelledby="trade-building-type-label" aria-required="true">
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
              aria-pressed={buildingType === type}
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
          aria-pressed={buildingType === 'Other'}
          >
            Other
          </button>
        </div>
      </div>

      {buildingType === 'Other' && (
        <div className={`lp-quiz-field${fieldHasIssue('otherBuildingType') ? ' lp-quiz-field--error' : ''}`}>
          <label htmlFor="trade-other-building-type">Describe building type</label>
          <input
            id="trade-other-building-type"
            name="other-building-type"
            value={otherBuildingType}
            onChange={(e) => setOtherBuildingType(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. Warehouse, Industrial unit"
            required
            aria-required="true"
            aria-invalid={fieldHasIssue('otherBuildingType')}
          />
        </div>
      )}

      {buildingType === 'Apartments' && (
        <div className={`lp-quiz-field${fieldHasIssue('unitNumber') ? ' lp-quiz-field--error' : ''}`}>
          <label htmlFor="trade-unit-number">Unit / apartment number</label>
          <input
            id="trade-unit-number"
            name="unit-number"
            autoComplete="address-line2"
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Unit number"
            required
            aria-required="true"
            aria-invalid={fieldHasIssue('unitNumber')}
          />
        </div>
      )}

      <div className={`lp-register-country-block lp-quiz-field lp-quiz-field--full${fieldHasIssue('country') ? ' lp-quiz-field--error' : ''}`}>
        {!showCountryPicker ? (
          <div className="lp-register-country-summary">
            <span>Country: {country}</span>
            <button type="button" className="lp-register-link" onClick={() => setCountryPickerOpen(true)}>
              Change country
            </button>
          </div>
        ) : (
          <>
            <div className={subheadClassName}>Country</div>
            <div className={countriesClassName} role="group" aria-label="Country" aria-required="true">
              {SADC_COUNTRIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`lp-quiz-country${country === c ? ' selected' : ''}`}
                  onClick={() => {
                    setCountry(c);
                    if (c !== 'South Africa') setProvince('');
                    if (c === 'South Africa') setCountryPickerOpen(false);
                  }}
                  aria-pressed={country === c}
                >
                  {c}
                </button>
              ))}
            </div>
            {country === 'South Africa' && (
              <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('province') ? ' lp-quiz-field--error' : ''}`}>
                <label htmlFor="trade-province">Province <span className="lp-register-optional">(optional — filled from address search)</span></label>
                <select
                  id="trade-province"
                  name="province"
                  autoComplete="address-level1"
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
            )}
          </>
        )}
      </div>
    </div>
  );
}

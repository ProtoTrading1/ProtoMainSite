import AddressAutocomplete from '../AddressAutocomplete';

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

  return (
    <>
      <div className={fieldClass(fieldKeys.street)}>
        <label>Street name</label>
        {streetUsesAutocomplete ? (
          <AddressAutocomplete
            value={street}
            onChange={setStreet}
            onPlaceSelect={onPlaceSelect}
            onKeyDown={onKeyDown}
            placeholder="Street name and number"
          />
        ) : (
          <input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Street name and number"
            required
            {...lockProps}
          />
        )}
      </div>
      <div className={fieldClass(fieldKeys.suburb)}>
        <label>Suburb</label>
        <input
          value={suburb}
          onChange={(e) => setSuburb(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Suburb"
          required
          {...lockProps}
        />
      </div>
      <div className={fieldClass(fieldKeys.postalCode)}>
        <label>Postal code</label>
        <input
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Postal code"
          required
          {...lockProps}
        />
      </div>
      <div className={fieldClass(fieldKeys.city)}>
        <label>City</label>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="City"
          required
          {...lockProps}
        />
      </div>
    </>
  );
}

export default function BillingDeliveryFields({
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
}) {
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
        streetUsesAutocomplete
        onPlaceSelect={onBillingPlaceSelect}
      />

      <div className={subheadClassName}>Delivery address</div>

      <label className="lp-register-same-address">
        <input
          type="checkbox"
          checked={deliverySameAsBilling}
          onChange={(e) => onDeliverySameAsBillingChange(e.target.checked)}
        />
        <span>Same as billing address</span>
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
        <div className={subheadClassName}>Building type</div>
        <div className={`${buildingTypesClassName}${fieldHasIssue('buildingType') ? ' lp-quiz-field--error' : ''}`}>
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
            onKeyDown={onKeyDown}
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
            onKeyDown={onKeyDown}
            placeholder="Unit number"
            required
          />
        </div>
      )}
    </div>
  );
}

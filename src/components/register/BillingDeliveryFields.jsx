import AddressAutocomplete from '../AddressAutocomplete';

const BUILDING_TYPES = ['Office Building', 'Apartments', 'House'];

export default function BillingDeliveryFields({
  companyAddress,
  onCompanyAddressChange,
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
  const lockProps = deliveryFieldsLocked
    ? { readOnly: true, 'aria-readonly': true }
    : {};

  return (
    <div className={gridClassName}>
      <div className={`lp-quiz-field lp-quiz-field--full${fieldHasIssue('companyAddress') ? ' lp-quiz-field--error' : ''}`}>
        <label>Billing address</label>
        <AddressAutocomplete
          value={companyAddress}
          onChange={onCompanyAddressChange}
          onPlaceSelect={onBillingPlaceSelect}
          onKeyDown={onKeyDown}
          placeholder="Start typing your billing address…"
        />
        <span className="lp-register-field-hint">Registered address for invoices and account records.</span>
      </div>

      <div className={subheadClassName}>Delivery address</div>

      <label className="lp-register-same-address">
        <input
          type="checkbox"
          checked={deliverySameAsBilling}
          onChange={(e) => onDeliverySameAsBillingChange(e.target.checked)}
        />
        <span>Same as billing address</span>
      </label>

      <div className={`lp-quiz-field${fieldHasIssue('streetName') ? ' lp-quiz-field--error' : ''}${deliveryFieldsLocked ? ' lp-quiz-field--locked' : ''}`}>
        <label>Street name</label>
        <input
          value={streetName}
          onChange={(e) => setStreetName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Street name and number"
          required
          {...lockProps}
        />
      </div>
      <div className={`lp-quiz-field${fieldHasIssue('suburb') ? ' lp-quiz-field--error' : ''}${deliveryFieldsLocked ? ' lp-quiz-field--locked' : ''}`}>
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
      <div className={`lp-quiz-field${fieldHasIssue('postalCode') ? ' lp-quiz-field--error' : ''}${deliveryFieldsLocked ? ' lp-quiz-field--locked' : ''}`}>
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
      <div className={`lp-quiz-field${fieldHasIssue('city') ? ' lp-quiz-field--error' : ''}${deliveryFieldsLocked ? ' lp-quiz-field--locked' : ''}`}>
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

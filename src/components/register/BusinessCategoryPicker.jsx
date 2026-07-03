import { REGISTER_BUSINESS_TYPE_ICONS, REGISTER_BUSINESS_TYPES } from '../../lib/businessTypes';

const MAIN_TYPES = REGISTER_BUSINESS_TYPES.filter((type) => type !== 'Other');

export default function BusinessCategoryPicker({
  selected = [],
  onToggle,
  otherValue = '',
  onOtherChange,
}) {
  return (
    <div className="lp-biz-category">
      <div className="lp-biz-category-head">
        <label className="lp-biz-category-label">
          Business category <span className="lp-biz-category-required">*</span>
        </label>
        <p className="lp-biz-category-hint">Select all options that describe your business.</p>
      </div>

      <div className="lp-biz-category-grid">
        {MAIN_TYPES.map((type) => {
          const Icon = REGISTER_BUSINESS_TYPE_ICONS[type];
          const isSelected = selected.includes(type);
          return (
            <button
              key={type}
              type="button"
              className={`lp-biz-category-card${isSelected ? ' selected' : ''}`}
              onClick={() => onToggle(type)}
              aria-pressed={isSelected}
            >
              <span className="lp-biz-category-icon" aria-hidden="true">
                <Icon size={22} strokeWidth={1.65} />
              </span>
              <span className="lp-biz-category-text">{type}</span>
            </button>
          );
        })}
      </div>

      <div className="lp-biz-category-or" aria-hidden="true">
        <span>or</span>
      </div>

      <button
        type="button"
        className={`lp-biz-category-card lp-biz-category-card--other${selected.includes('Other') ? ' selected' : ''}`}
        onClick={() => onToggle('Other')}
        aria-pressed={selected.includes('Other')}
      >
        <span className="lp-biz-category-icon" aria-hidden="true">
          <REGISTER_BUSINESS_TYPE_ICONS.Other size={22} strokeWidth={1.65} />
        </span>
        <span className="lp-biz-category-text">Other (please specify)</span>
      </button>

      {selected.includes('Other') && (
        <div className="lp-quiz-field lp-quiz-other-field">
          <label>Describe your business</label>
          <input
            value={otherValue}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Tell us what type of business you run"
          />
        </div>
      )}
    </div>
  );
}

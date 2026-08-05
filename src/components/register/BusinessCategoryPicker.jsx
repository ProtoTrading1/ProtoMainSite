import { useId } from 'react';
import { Check } from 'lucide-react';
import {
  REGISTER_BUSINESS_TYPE_ICONS,
  REGISTER_BUSINESS_TYPES,
  TRADING_CHANNEL_ICONS,
  TRADING_CHANNELS,
} from '../../lib/businessTypes';

const MAIN_TYPES = REGISTER_BUSINESS_TYPES.filter((type) => type !== 'Other');

export default function BusinessCategoryPicker({
  selectedChannels = [],
  onToggleChannel,
  selectedCategories = [],
  onToggleCategory,
  otherValue = '',
  onOtherChange,
}) {
  const channelLabelId = useId();
  const categoryLabelId = useId();
  const otherInputId = useId();
  const channelCountId = useId();
  const categoryCountId = useId();

  return (
    <div className="lp-biz-category">
      <div className="lp-biz-category-head">
        <div id={channelLabelId} className="lp-biz-category-label">
          1. How do you trade? <span className="lp-biz-category-required">(required)</span>
        </div>
        <p className="lp-biz-category-hint">Select all the ways customers normally buy from you.</p>
        <p id={channelCountId} className="lp-biz-category-count" aria-live="polite">
          {selectedChannels.length === 0 ? 'None selected yet' : `${selectedChannels.length} selected`}
        </p>
      </div>

      <div className="lp-biz-category-grid" role="group" aria-labelledby={channelLabelId} aria-describedby={channelCountId} aria-required="true">
        {TRADING_CHANNELS.map((type) => {
          const Icon = TRADING_CHANNEL_ICONS[type];
          const isSelected = selectedChannels.includes(type);
          return (
            <button key={type} type="button" className={`lp-biz-category-card${isSelected ? ' selected' : ''}`} onClick={() => onToggleChannel(type)} aria-pressed={isSelected} aria-label={`${type}${isSelected ? ', selected' : ''}`}>
              <span className="lp-biz-category-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.65} /></span>
              <span className="lp-biz-category-text">{type}</span>
              {isSelected && <Check className="lp-biz-category-check" size={16} strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="lp-biz-category-head lp-biz-category-head--second">
        <div id={categoryLabelId} className="lp-biz-category-label">
          2. What do you mainly sell? <span className="lp-biz-category-required">(required)</span>
        </div>
        <p className="lp-biz-category-hint">Choose all the product groups that apply.</p>
        <p id={categoryCountId} className="lp-biz-category-count" aria-live="polite">
          {selectedCategories.length === 0 ? 'None selected yet' : `${selectedCategories.length} selected`}
        </p>
      </div>

      <div className="lp-biz-category-grid" role="group" aria-labelledby={categoryLabelId} aria-describedby={categoryCountId} aria-required="true">
        {MAIN_TYPES.map((type) => {
          const Icon = REGISTER_BUSINESS_TYPE_ICONS[type];
          const isSelected = selectedCategories.includes(type);
          return (
            <button
              key={type}
              type="button"
              className={`lp-biz-category-card${isSelected ? ' selected' : ''}`}
              onClick={() => onToggleCategory(type)}
              aria-pressed={isSelected}
              aria-label={`${type}${isSelected ? ', selected' : ''}`}
            >
              <span className="lp-biz-category-icon" aria-hidden="true">
                <Icon size={22} strokeWidth={1.65} />
              </span>
              <span className="lp-biz-category-text">{type}</span>
              {isSelected && <Check className="lp-biz-category-check" size={16} strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="lp-biz-category-or" aria-hidden="true">
        <span>or</span>
      </div>

      <button
        type="button"
        className={`lp-biz-category-card lp-biz-category-card--other${selectedCategories.includes('Other') ? ' selected' : ''}`}
        onClick={() => onToggleCategory('Other')}
        aria-pressed={selectedCategories.includes('Other')}
        aria-label={`Other (please specify)${selectedCategories.includes('Other') ? ', selected' : ''}`}
      >
        <span className="lp-biz-category-icon" aria-hidden="true">
          <REGISTER_BUSINESS_TYPE_ICONS.Other size={22} strokeWidth={1.65} />
        </span>
        <span className="lp-biz-category-text">Other (please specify)</span>
        {selectedCategories.includes('Other') && <Check className="lp-biz-category-check" size={16} strokeWidth={3} aria-hidden="true" />}
      </button>

      {selectedCategories.includes('Other') && (
        <div className="lp-quiz-field lp-quiz-other-field">
          <label htmlFor={otherInputId}>Describe your business</label>
          <input
            id={otherInputId}
            value={otherValue}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Tell us what type of business you run"
            required
          />
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { ArrowRight, BarChart3 } from 'lucide-react';
import { MONTHLY_SPEND_BANDS } from '../../lib/businessTypes';

export default function MonthlySpendOptional({ value, onChange }) {
  const [expanded, setExpanded] = useState(Boolean(value));

  if (!expanded) {
    return (
      <div className="lp-monthly-spend-card">
        <div className="lp-monthly-spend-icon" aria-hidden="true">
          <BarChart3 size={20} strokeWidth={2} />
        </div>
        <div className="lp-monthly-spend-copy">
          <strong>Estimated monthly spend (optional)</strong>
          <span>You can add this later in your profile.</span>
        </div>
        <button
          type="button"
          className="lp-monthly-spend-later"
          onClick={() => setExpanded(true)}
        >
          Add later
          <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="lp-monthly-spend-expanded">
      <div className="lp-monthly-spend-expanded-head">
        <div className="lp-monthly-spend-icon" aria-hidden="true">
          <BarChart3 size={20} strokeWidth={2} />
        </div>
        <div className="lp-monthly-spend-copy">
          <strong>Estimated monthly spend (optional)</strong>
          <span>Select a range that best matches your typical orders.</span>
        </div>
        {!value && (
          <button
            type="button"
            className="lp-monthly-spend-later"
            onClick={() => setExpanded(false)}
          >
            Skip
            <ArrowRight size={15} />
          </button>
        )}
      </div>
      <div className="lp-monthly-spend-bands">
        {MONTHLY_SPEND_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            className={`lp-monthly-spend-band${value === band ? ' selected' : ''}`}
            onClick={() => onChange(value === band ? '' : band)}
          >
            {band}
          </button>
        ))}
      </div>
    </div>
  );
}

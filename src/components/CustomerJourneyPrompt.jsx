import { ArrowRight, ShoppingBag, Sparkles, X } from 'lucide-react';
import './CustomerJourneyPrompt.css';

const DEFAULT_COPY = {
  toast: {
    eyebrow: 'PROTO TRADING ONLINE',
    title: 'Welcome',
    message: 'Your wholesale catalogue is ready.',
    primaryLabel: 'Browse catalogue',
  },
  basket: {
    eyebrow: 'YOUR BASKET',
    title: 'Your basket is waiting',
    message: 'Pick up where you left off.',
    primaryLabel: 'Review basket',
  },
};

/**
 * Renders an already-resolved customer journey prompt.
 *
 * Expected state fields:
 * presentation, eyebrow, title, message, primaryLabel, secondaryLabel,
 * itemCountLabel, totalLabel, and dismissible.
 */
export default function CustomerJourneyPrompt({
  state,
  onPrimary,
  onSecondary,
  onDismiss,
}) {
  if (!state) return null;

  const presentation = state.presentation === 'basket' ? 'basket' : 'toast';
  const fallback = DEFAULT_COPY[presentation];
  const title = state.title || fallback.title;
  const message = state.message || fallback.message;
  const eyebrow = state.eyebrow || fallback.eyebrow;
  const primaryLabel = state.primaryLabel || fallback.primaryLabel;
  const showDismiss = state.dismissible !== false && typeof onDismiss === 'function';
  const showSecondary = presentation !== 'basket'
    && Boolean(state.secondaryLabel)
    && typeof onSecondary === 'function';
  const titleId = `customer-journey-${presentation}-title`;
  const messageId = `customer-journey-${presentation}-message`;
  const Icon = presentation === 'basket' ? ShoppingBag : Sparkles;
  const isTimed = Number.isFinite(state.dismissAfterMs) && state.dismissAfterMs > 0;

  return (
    <aside
      className={`customer-journey-prompt customer-journey-prompt--${presentation}`}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      data-presentation={presentation}
      data-timed={isTimed ? 'true' : 'false'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !showDismiss) return;
        event.preventDefault();
        onDismiss(event);
      }}
      style={isTimed ? { '--customer-journey-duration': `${state.dismissAfterMs}ms` } : undefined}
    >
      <div className="customer-journey-prompt__accent" aria-hidden="true" />

      <div className="customer-journey-prompt__icon" aria-hidden="true">
        <Icon size={presentation === 'basket' ? 24 : 20} strokeWidth={1.8} />
      </div>

      <div className="customer-journey-prompt__content">
        <div
          className="customer-journey-prompt__announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="customer-journey-prompt__eyebrow">{eyebrow}</p>
          <h2 id={titleId} className="customer-journey-prompt__title">{title}</h2>
          <p id={messageId} className="customer-journey-prompt__message">{message}</p>

          {presentation === 'basket' && (state.itemCountLabel || state.totalLabel) ? (
            <div className="customer-journey-prompt__basket-summary" aria-label="Basket summary">
              {state.itemCountLabel ? <span>{state.itemCountLabel}</span> : null}
              {state.itemCountLabel && state.totalLabel ? <span aria-hidden="true">•</span> : null}
              {state.totalLabel ? <strong>{state.totalLabel}</strong> : null}
            </div>
          ) : null}
        </div>

        <div className="customer-journey-prompt__actions">
          <button
            className="customer-journey-prompt__button customer-journey-prompt__button--primary"
            type="button"
            onClick={onPrimary}
          >
            <span>{primaryLabel}</span>
            <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
          </button>

          {showSecondary ? (
            <button
              className="customer-journey-prompt__button customer-journey-prompt__button--secondary"
              type="button"
              onClick={onSecondary}
            >
              {state.secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>

      {showDismiss ? (
        <button
          className="customer-journey-prompt__close"
          type="button"
          onClick={onDismiss}
          aria-label={presentation === 'basket' ? 'Close basket reminder and continue shopping' : 'Dismiss customer message'}
        >
          <X size={19} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}

      {isTimed ? <span className="customer-journey-prompt__timer" aria-hidden="true" /> : null}
    </aside>
  );
}

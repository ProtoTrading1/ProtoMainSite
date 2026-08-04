import { useEffect, useState } from 'react';
import { Flame, Search, Sparkles, X } from 'lucide-react';
import {
  completeBuyingAssistant,
  fetchBuyingAssistantState,
  hasCompletedBuyingAssistant,
  rememberBuyingAssistantCompletion,
} from '../lib/buyingAssistant';

const OPTIONS = [
  { id: 'hot', label: 'See proven sellers', detail: 'Start with products other traders order regularly.', Icon: Flame },
  { id: 'specials', label: 'Find current specials', detail: 'See active offers before building your order.', Icon: Sparkles },
  { id: 'start', label: 'Browse the full catalogue', detail: 'Explore every department and use search for codes or descriptions.', Icon: Search },
];

export default function FirstLoginBuyingAssistant({ customer, onChoose }) {
  const customerId = customer?.id;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!customerId || hasCompletedBuyingAssistant(customerId)) return undefined;
    setOpen(true);
    void fetchBuyingAssistantState().then((state) => {
      if (cancelled || !state?.completed) return;
      rememberBuyingAssistantCompletion(customerId);
      setOpen(false);
    }).catch(() => { /* preview works before migration 064 is applied */ });
    return () => { cancelled = true; };
  }, [customerId]);

  if (!open) return null;

  const finish = (goal = 'dismissed') => {
    rememberBuyingAssistantCompletion(customerId);
    setOpen(false);
    void completeBuyingAssistant(goal).catch(() => { /* local completion remains reliable */ });
    if (goal !== 'dismissed') onChoose(goal);
  };

  return (
    <div className="buying-assistant-backdrop" role="presentation">
      <section className="buying-assistant" role="dialog" aria-modal="true" aria-labelledby="buying-assistant-title">
        <button type="button" className="buying-assistant-close" onClick={() => finish()} aria-label="Close buying assistant"><X size={20} /></button>
        <p className="buying-assistant-kicker">WELCOME TO PROTO ONLINE</p>
        <h2 id="buying-assistant-title">Where would you like to start?</h2>
        <p className="buying-assistant-intro">Choose one route and we’ll take you straight there. You can still browse everything at any time.</p>
        <div className="buying-assistant-options">
          {OPTIONS.map(({ id, label, detail, Icon }) => (
            <button type="button" key={id} onClick={() => finish(id)}>
              <Icon size={22} aria-hidden="true" />
              <span><strong>{label}</strong><small>{detail}</small></span>
            </button>
          ))}
        </div>
        <button type="button" className="buying-assistant-skip" onClick={() => finish()}>Skip — I know where I’m going</button>
      </section>
    </div>
  );
}

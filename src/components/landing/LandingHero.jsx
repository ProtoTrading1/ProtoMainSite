import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const ROTATING_SUPPORT_MESSAGES = [
  'Trusted by South African retailers since 1987.',
  '5,000+ wholesale products with live stock.',
  'Exclusive trade pricing for approved retailers.',
  'Built for retailers, resellers and growing businesses.',
  'Spend less time ordering.\nMore time growing your business.',
  'One supplier.\nThousands of possibilities.',
];

export default function LandingHero({ onLogin, onApply }) {
  const [messageIdx, setMessageIdx] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const reduceMotion = useRef(false);
  const [lineAnimationActive, setLineAnimationActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion.current = media.matches;
    const onChange = (e) => {
      reduceMotion.current = e.matches;
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener(onChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', onChange);
      else media.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (reduceMotion.current) return undefined;
    if (typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => {
      setLineAnimationActive(true);
    }, 220);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (reduceMotion.current || ROTATING_SUPPORT_MESSAGES.length <= 1) return undefined;

    let holdTimer = null;
    let fadeTimer = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      holdTimer = window.setTimeout(() => {
        if (cancelled || document.visibilityState !== 'visible') return;
        setIsFading(true);
        fadeTimer = window.setTimeout(() => {
          if (cancelled) return;
          setMessageIdx((prev) => (prev + 1) % ROTATING_SUPPORT_MESSAGES.length);
          setIsFading(false);
          scheduleNext();
        }, 200);
      }, 9000);
    };

    const handleVisibilityChange = () => {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (fadeTimer) {
        window.clearTimeout(fadeTimer);
        fadeTimer = null;
      }
      setIsFading(false);
      if (document.visibilityState === 'visible') {
        scheduleNext();
      }
    };

    if (document.visibilityState === 'visible') {
      scheduleNext();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (holdTimer) window.clearTimeout(holdTimer);
      if (fadeTimer) window.clearTimeout(fadeTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const activeMessage = ROTATING_SUPPORT_MESSAGES[messageIdx].split('\n');

  return (
    <section className="vhero-section vhero-section--static vhero-section--banner">
      <img
        src="/proto-banner.jpg"
        alt="Proto Trading Online wholesale showroom"
        className="vhero-banner-img"
        fetchPriority="high"
        decoding="async"
      />
      <div className="vhero-banner-scrim" />
      <div className="vhero-copy">
        <h1 className="vhero-headline" aria-label="Wholesale made smarter">
          <span className="vhero-headline-line">WHOLESALE</span>
          <span className="vhero-headline-line">MADE</span>
          <span className="vhero-headline-line vhero-headline-line--accent">SMARTER.</span>
        </h1>
        <div className="vhero-support-wrap" aria-live="off" aria-atomic="true">
          <p className={`vhero-support-message${isFading ? ' is-fading' : ''}`}>
            {activeMessage.map((line, idx) => (
              <span key={`${messageIdx}-${idx}`} className="vhero-support-line">
                {line}
              </span>
            ))}
          </p>
        </div>
        <div className="access-hero-buttons">
          <button className="access-apply large" type="button" onClick={onApply}>
            Apply for Trade Account <ArrowRight size={18} />
          </button>
          <button className="access-login large" type="button" onClick={onLogin}>
            Sign In
          </button>
        </div>
        <div className="vhero-trust-strip" role="list" aria-label="Wholesale platform highlights">
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>5,000+ PRODUCTS</strong>
              <span>One supplier for your business.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>REAL-TIME STOCK</strong>
              <span>Live inventory, always up to date.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>EXCLUSIVE TRADE PRICING</strong>
              <span>Wholesale pricing for approved customers.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>FAST REORDERING</strong>
              <span>Buy your favourites again in seconds.</span>
            </div>
          </div>
        </div>
      </div>
      <div className={`vhero-line-visual${lineAnimationActive ? ' is-animated' : ''}`} aria-hidden="true">
        <div className="vhero-line-track">
          <span className="vhero-line-node" style={{ top: '12%' }} />
          <span className="vhero-line-node" style={{ top: '36%' }} />
          <span className="vhero-line-node" style={{ top: '68%' }} />
          <span className="vhero-line-node" style={{ top: '92%' }} />
          <span className="vhero-line-tracer" />
        </div>
      </div>
    </section>
  );
}

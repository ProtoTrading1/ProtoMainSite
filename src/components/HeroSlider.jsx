import { useEffect, useState } from 'react';

const SLIDES = [
  '/slides/Image 8.jpg',
  '/slides/Image 69.jpg',
  '/slides/Image 70.jpg',
  '/slides/Image 71.jpg',
  '/slides/Image 72.jpg',
  '/slides/Image 73.jpg',
  '/slides/Image 74.jpg',
  '/slides/Image 75.jpg',
  '/slides/Image 76.jpg',
];

const DISPLAY_MS = 3800;
const TRANSITION_MS = 1200;

export default function HeroSlider() {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setPrev(current);
      setTransitioning(true);
      setCurrent((c) => (c + 1) % SLIDES.length);
      setTimeout(() => { setPrev(null); setTransitioning(false); }, TRANSITION_MS + 100);
    }, DISPLAY_MS);
    return () => clearInterval(timer);
  }, [current]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: '#0a0a0a',
    }}>
      <style>{`
        @keyframes slideIn {
          0%   { opacity: 0; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1.0); }
        }
        @keyframes slideOut {
          0%   { opacity: 1; transform: scale(1.0); }
          100% { opacity: 0; transform: scale(0.92); }
        }
        @keyframes kenBurns {
          0%   { transform: scale(1.0); }
          100% { transform: scale(1.08); }
        }
      `}</style>

      {/* Outgoing image */}
      {prev !== null && (
        <img
          key={`prev-${prev}`}
          src={SLIDES[prev]}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            animation: `slideOut ${TRANSITION_MS}ms cubic-bezier(0.4,0,0.2,1) forwards`,
            zIndex: 1,
          }}
        />
      )}

      {/* Active image */}
      <img
        key={`curr-${current}`}
        src={SLIDES[current]}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          animation: transitioning
            ? `slideIn ${TRANSITION_MS}ms cubic-bezier(0.4,0,0.2,1) forwards`
            : `kenBurns ${DISPLAY_MS}ms ease-in-out forwards`,
          zIndex: 2,
        }}
      />

      {/* Subtle dark vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.32) 100%)',
        zIndex: 3,
        pointerEvents: 'none',
      }} />

      {/* Dot indicators */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '6px',
        zIndex: 4,
      }}>
        {SLIDES.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === current ? '20px' : '6px',
              height: '6px',
              borderRadius: '999px',
              background: i === current ? '#fff' : 'rgba(255,255,255,0.4)',
              transition: 'all 0.4s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

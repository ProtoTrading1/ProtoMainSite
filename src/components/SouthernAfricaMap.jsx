import { useEffect, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// African countries ordered roughly north → south, so the red sweep
// rolls down the continent and lands on South Africa right before the
// camera dives toward Cape Town.
const REDDEN_ORDER = [
  788, 504, 12, 434, 818, 732,                    // far north
  478, 466, 562, 148, 729, 232, 262,              // Sahel
  686, 270, 624, 324, 694, 430, 384, 854, 288,    // West Africa
  768, 204, 566, 728, 231, 706,
  120, 140, 226, 266, 178, 180, 800, 646, 108, 404, // Central / Great Lakes
  834, 24, 894, 454, 508, 450,                    // South-central
  516, 72, 716,                                    // Southern
  748, 426, 710,                                   // tip — ends on South Africa
];
const AFRICA_IDS = new Set(REDDEN_ORDER);
const RANK = new Map(REDDEN_ORDER.map((id, i) => [id, i]));
const N = REDDEN_ORDER.length;

// Camera keyframes (geoMercator center [lon, lat] + scale)
const VIEW_AFRICA = { lon: 17, lat: 3, scale: 380 };
const VIEW_CAPE = { lon: 20, lat: -33.6, scale: 2600 };
const CAPE_TOWN = [18.42, -33.92];

// Looping timeline (ms) — each phase is a duration; they run back to back.
const T = {
  greyHold: 700,    // all grey
  redden: 1800,     // grey → red, north to south
  redHold: 600,     // full red, framed on Africa
  zoomIn: 2200,     // dive toward Cape Town
  capeHold: 1700,   // hold on Cape Town, pin pulsing
  zoomOut: 1700,    // pull back to the full red continent
  fullHold: 1500,   // rest on the red continent before resetting
};
const CYCLE = Object.values(T).reduce((a, b) => a + b, 0);

const COLOR_GREY = '#333333';
const COLOR_RED = '#a01818';
const COLOR_SA = '#c0392b';

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerpView = (from, to, t) => ({
  lon: lerp(from.lon, to.lon, t),
  lat: lerp(from.lat, to.lat, t),
  scale: lerp(from.scale, to.scale, t),
});

// Returns the animation state for a given elapsed time within one cycle.
function frameAt(t) {
  let m = t % CYCLE;
  // 1 — grey hold
  if (m < T.greyHold) return { redCount: 0, view: VIEW_AFRICA, pinT: 0 };
  m -= T.greyHold;
  // 2 — red sweep
  if (m < T.redden) return { redCount: Math.ceil((m / T.redden) * N), view: VIEW_AFRICA, pinT: 0 };
  m -= T.redden;
  // 3 — full red, hold on Africa
  if (m < T.redHold) return { redCount: N, view: VIEW_AFRICA, pinT: 0 };
  m -= T.redHold;
  // 4 — zoom in to Cape Town
  if (m < T.zoomIn) {
    const e = easeInOut(m / T.zoomIn);
    return { redCount: N, view: lerpView(VIEW_AFRICA, VIEW_CAPE, e), pinT: Math.max(0, (e - 0.4) / 0.6) };
  }
  m -= T.zoomIn;
  // 5 — hold on Cape Town
  if (m < T.capeHold) return { redCount: N, view: VIEW_CAPE, pinT: 1 };
  m -= T.capeHold;
  // 6 — zoom back out
  if (m < T.zoomOut) {
    const e = easeInOut(m / T.zoomOut);
    return { redCount: N, view: lerpView(VIEW_CAPE, VIEW_AFRICA, e), pinT: Math.max(0, 1 - e / 0.6) };
  }
  m -= T.zoomOut;
  // 7 — rest on full red continent
  return { redCount: N, view: VIEW_AFRICA, pinT: 0 };
}

export default function SouthernAfricaMap() {
  const ref = useRef(null);
  const rafRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [{ redCount, view, pinT }, setFrame] = useState(() => frameAt(0));

  // Pause/resume with viewport visibility (keeps it cheap when off-screen)
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '80px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return undefined;

    const reduce =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      // Static, fully visible end-state: the whole continent in red.
      setFrame({ redCount: N, view: VIEW_AFRICA, pinT: 0 });
      return undefined;
    }

    const start = performance.now();
    const tick = (now) => {
      setFrame(frameAt(now - start));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [inView]);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [view.lon, view.lat], scale: view.scale }}
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies
              .filter((g) => AFRICA_IDS.has(+g.id))
              .map((geo) => {
                const id = +geo.id;
                const isRed = (RANK.get(id) ?? Infinity) < redCount;
                const fill = isRed ? (id === 710 ? COLOR_SA : COLOR_RED) : COLOR_GREY;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#000"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none', transition: 'fill 0.5s ease' },
                      hover: { outline: 'none', fill },
                      pressed: { outline: 'none', fill },
                    }}
                  />
                );
              })
          }
        </Geographies>

        {pinT > 0.01 && (
          <Marker coordinates={CAPE_TOWN}>
            <g transform={`translate(0, ${-14 + 6 * (1 - pinT)})`} style={{ opacity: pinT }}>
              {/* pulse ring */}
              <circle r="13" fill="#c0392b" opacity={0.22 * pinT}>
                <animate attributeName="r" from="6" to="20" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.35" to="0" dur="1.6s" repeatCount="indefinite" />
              </circle>
              {/* pin */}
              <path
                d="M0 0 C -7 -10 -7 -18 0 -24 C 7 -18 7 -10 0 0 Z"
                fill="#c0392b"
                stroke="#fff"
                strokeWidth="0.8"
              />
              <circle cx="0" cy="-16" r="3.2" fill="#fff" />
            </g>
            <text
              y="14"
              textAnchor="middle"
              style={{
                fill: '#fff',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.5px',
                opacity: pinT,
                paintOrder: 'stroke',
                stroke: '#000',
                strokeWidth: '3px',
              }}
            >
              Cape Town
            </text>
          </Marker>
        )}
      </ComposableMap>
    </div>
  );
}

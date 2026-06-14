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
const VIEW_CAPE = { lon: 20, lat: -33.6, scale: 2800 };
const CAPE_TOWN = [18.42, -33.92];

// Timeline (ms)
const GREY_HOLD = 600;
const REDDEN_DUR = 1700;
const RED_HOLD = 550;
const ZOOM_DUR = 2300;

const COLOR_GREY = '#2b2b2b';
const COLOR_RED = '#a01818';
const COLOR_SA = '#c0392b';

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export default function SouthernAfricaMap() {
  const ref = useRef(null);
  const rafRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [redCount, setRedCount] = useState(0);
  const [view, setView] = useState(VIEW_AFRICA);
  const [pinT, setPinT] = useState(0); // 0 → 1 as we arrive at Cape Town

  // Trigger once the section scrolls into view
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px 0px' }
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
      // Static end-state: all red, framed on the cape, pin shown.
      setRedCount(N);
      setView(VIEW_CAPE);
      setPinT(1);
      return undefined;
    }

    const start = performance.now();
    const zoomStart = GREY_HOLD + REDDEN_DUR + RED_HOLD;
    const end = zoomStart + ZOOM_DUR;

    const tick = (now) => {
      const t = now - start;

      // Phase 2 — red sweep, north to south
      const rp = Math.max(0, Math.min((t - GREY_HOLD) / REDDEN_DUR, 1));
      setRedCount(Math.round(rp * N));

      // Phase 3 — dive toward Cape Town
      const zp = Math.max(0, Math.min((t - zoomStart) / ZOOM_DUR, 1));
      const e = easeInOutCubic(zp);
      setView({
        lon: lerp(VIEW_AFRICA.lon, VIEW_CAPE.lon, e),
        lat: lerp(VIEW_AFRICA.lat, VIEW_CAPE.lat, e),
        scale: lerp(VIEW_AFRICA.scale, VIEW_CAPE.scale, e),
      });
      setPinT(Math.max(0, Math.min((zp - 0.45) / 0.55, 1)));

      if (t < end) {
        rafRef.current = requestAnimationFrame(tick);
      }
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
                      default: { outline: 'none', transition: 'fill 0.55s ease' },
                      hover: { outline: 'none', fill },
                      pressed: { outline: 'none', fill },
                    }}
                  />
                );
              })
          }
        </Geographies>

        {pinT > 0 && (
          <Marker coordinates={CAPE_TOWN}>
            <g
              transform={`translate(0, ${-14 + 6 * (1 - pinT)})`}
              style={{ opacity: pinT }}
            >
              {/* pulse ring */}
              <circle r="13" fill="#c0392b" opacity={0.22 * pinT}>
                <animate
                  attributeName="r"
                  from="6"
                  to="20"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.35"
                  to="0"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
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

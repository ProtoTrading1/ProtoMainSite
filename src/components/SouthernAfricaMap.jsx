import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

// NOTE: react-simple-maps@3 relies on function-component defaultProps, which
// React 19 ignores — so it renders nothing. This component draws the map
// directly with d3-geo instead, which is React-version independent.

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// African countries ordered roughly north → south, so the red sweep rolls
// down the continent and lands on South Africa right before the camera dives
// toward Cape Town.
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

// SVG canvas (viewBox); scaled to fit the container via preserveAspectRatio.
const W = 800;
const H = 600;

// Camera keyframes (geoMercator center [lon, lat] + scale)
const VIEW_AFRICA = { lon: 17, lat: 3, scale: 380 };
const VIEW_CAPE = { lon: 20, lat: -33.6, scale: 2600 };
const CAPE_TOWN = [18.42, -33.92];

// Looping timeline (ms) — phases run back to back, then repeat.
const T = {
  greyHold: 700,
  redden: 1800,
  redHold: 600,
  zoomIn: 2200,
  capeHold: 1700,
  zoomOut: 1700,
  fullHold: 1500,
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

function frameAt(t) {
  let m = t % CYCLE;
  if (m < T.greyHold) return { redCount: 0, view: VIEW_AFRICA, pinT: 0 };
  m -= T.greyHold;
  if (m < T.redden) return { redCount: Math.ceil((m / T.redden) * N), view: VIEW_AFRICA, pinT: 0 };
  m -= T.redden;
  if (m < T.redHold) return { redCount: N, view: VIEW_AFRICA, pinT: 0 };
  m -= T.redHold;
  if (m < T.zoomIn) {
    const e = easeInOut(m / T.zoomIn);
    return { redCount: N, view: lerpView(VIEW_AFRICA, VIEW_CAPE, e), pinT: Math.max(0, (e - 0.4) / 0.6) };
  }
  m -= T.zoomIn;
  if (m < T.capeHold) return { redCount: N, view: VIEW_CAPE, pinT: 1 };
  m -= T.capeHold;
  if (m < T.zoomOut) {
    const e = easeInOut(m / T.zoomOut);
    return { redCount: N, view: lerpView(VIEW_CAPE, VIEW_AFRICA, e), pinT: Math.max(0, 1 - e / 0.6) };
  }
  return { redCount: N, view: VIEW_AFRICA, pinT: 0 };
}

export default function SouthernAfricaMap() {
  const ref = useRef(null);
  const rafRef = useRef(null);
  const [geos, setGeos] = useState([]); // African country features
  const [inView, setInView] = useState(false);
  const [{ redCount, view, pinT }, setFrame] = useState(() => frameAt(0));

  // Load + convert the topojson once
  useEffect(() => {
    let alive = true;
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((topo) => {
        if (!alive) return;
        const fc = feature(topo, topo.objects.countries);
        setGeos(fc.features.filter((f) => AFRICA_IDS.has(+f.id)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Pause/resume with viewport visibility
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
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setFrame({ redCount: N, view: VIEW_AFRICA, pinT: 0 });
      return undefined;
    }
    const start = performance.now();
    const tick = (now) => {
      setFrame(frameAt(now - start));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [inView]);

  // Projection + path generator for the current camera frame
  const { paths, pin } = useMemo(() => {
    const projection = geoMercator()
      .center([view.lon, view.lat])
      .scale(view.scale)
      .translate([W / 2, H / 2]);
    const path = geoPath(projection);
    const built = geos.map((f) => {
      const id = +f.id;
      const isRed = (RANK.get(id) ?? Infinity) < redCount;
      return {
        key: f.id,
        d: path(f),
        fill: isRed ? (id === 710 ? COLOR_SA : COLOR_RED) : COLOR_GREY,
      };
    });
    return { paths: built, pin: projection(CAPE_TOWN) };
  }, [geos, view, redCount]);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <g>
          {paths.map((p) =>
            p.d ? (
              <path
                key={p.key}
                d={p.d}
                fill={p.fill}
                stroke="#000"
                strokeWidth={0.5}
                style={{ transition: 'fill 0.5s ease' }}
              />
            ) : null
          )}
        </g>

        {pinT > 0.01 && pin && (
          <g transform={`translate(${pin[0]}, ${pin[1]})`}>
            <g transform={`translate(0, ${-14 + 6 * (1 - pinT)})`} style={{ opacity: pinT }}>
              <circle r="13" fill="#c0392b" opacity={0.22 * pinT}>
                <animate attributeName="r" from="6" to="22" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.35" to="0" dur="1.6s" repeatCount="indefinite" />
              </circle>
              <path
                d="M0 0 C -8 -11 -8 -20 0 -27 C 8 -20 8 -11 0 0 Z"
                fill="#c0392b"
                stroke="#fff"
                strokeWidth="1"
              />
              <circle cx="0" cy="-18" r="3.6" fill="#fff" />
            </g>
            <text
              y="16"
              textAnchor="middle"
              style={{
                fill: '#fff',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 800,
                fontSize: '13px',
                letterSpacing: '0.5px',
                opacity: pinT,
                paintOrder: 'stroke',
                stroke: '#000',
                strokeWidth: '3px',
              }}
            >
              Cape Town
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

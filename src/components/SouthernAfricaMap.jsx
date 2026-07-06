import { useEffect, useMemo, useRef, useState } from 'react';
import { PROTO_ICON_SOURCES } from '../lib/brandAssets';
import { geoMercator, geoPath } from 'd3-geo';
import africaGeo from '../data/africa.geo.json';

// NOTE 1: react-simple-maps@3 relies on function-component defaultProps, which
// React 19 ignores — so it renders nothing. This component draws the map
// directly with d3-geo instead, which is React-version independent.
//
// NOTE 2: the geography data is bundled locally (src/data/africa.geo.json)
// rather than fetched from a CDN. The site's CSP `connect-src` only allows
// 'self' + supabase + google-fonts, so a runtime CDN fetch is blocked in
// production — which previously left the map blank.

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

// Camera keyframes (geoMercator center [lon, lat] + scale).
// VIEW_CAPE frames South Africa filling the canvas with the Cape Town pin —
// a much stronger final image than zooming all the way to the empty coastline.
const VIEW_AFRICA = { lon: 17, lat: 3, scale: 380 };
const VIEW_CAPE = { lon: 23, lat: -30, scale: 1500 };
const CAPE_TOWN = [18.42, -33.92];

// Looping timeline (ms) — runs continuously: redden → dive to Cape Town /
// Proto Trading → hold → pull back out → repeat.
const T = {
  greyHold: 700,   // whole continent grey
  redden: 1900,    // grey → red, north to south
  redHold: 700,    // hold on the full red continent
  zoomIn: 2400,    // dive in to frame South Africa + Cape Town
  capeHold: 2600,  // rest on the Proto Trading frame
  zoomOut: 1500,   // pull back to the full continent before looping
};
const CYCLE = Object.values(T).reduce((a, b) => a + b, 0);

const COLOR_GREY = '#333333';
const COLOR_RED = '#6e0d0d';  // other African countries — dark red
const COLOR_SA = '#e60000';   // South Africa — strong red
const FRAME_INTERVAL_MS = 1000 / 30; // cap updates at 30fps for low CPU cost

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerpView = (from, to, t) => ({
  lon: lerp(from.lon, to.lon, t),
  lat: lerp(from.lat, to.lat, t),
  scale: lerp(from.scale, to.scale, t),
});

function withPulse(frame, t) {
  const pulseT = frame.pinT > 0 ? ((t % 1100) / 1100) : 0;
  return { ...frame, pulseT };
}

function frameAt(t) {
  let m = t;
  if (m < T.greyHold) return withPulse({ redCount: 0, view: VIEW_AFRICA, pinT: 0 }, t);
  m -= T.greyHold;
  if (m < T.redden) return withPulse({ redCount: Math.ceil((m / T.redden) * N), view: VIEW_AFRICA, pinT: 0 }, t);
  m -= T.redden;
  if (m < T.redHold) return withPulse({ redCount: N, view: VIEW_AFRICA, pinT: 0 }, t);
  m -= T.redHold;
  if (m < T.zoomIn) {
    const e = easeInOut(m / T.zoomIn);
    return withPulse({ redCount: N, view: lerpView(VIEW_AFRICA, VIEW_CAPE, e), pinT: Math.max(0, (e - 0.4) / 0.6) }, t);
  }
  m -= T.zoomIn;
  if (m < T.capeHold) return withPulse({ redCount: N, view: VIEW_CAPE, pinT: 1 }, t);
  m -= T.capeHold;
  // Pull back out to the full continent, then the cycle restarts (the CSS fill
  // transition fades the countries red → grey on the next pass).
  const e = easeInOut(m / T.zoomOut);
  return withPulse({ redCount: N, view: lerpView(VIEW_CAPE, VIEW_AFRICA, e), pinT: 1 - e }, t);
}

export default function SouthernAfricaMap() {
  const [logoIndex, setLogoIndex] = useState(0);
  const ref = useRef(null);
  const rafRef = useRef(null);
  const phaseRef = useRef(0);
  const lastFrameTsRef = useRef(-FRAME_INTERVAL_MS);
  const [inView, setInView] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [{ redCount, view, pinT, pulseT }, setFrame] = useState(() => frameAt(0));

  // African country features, bundled locally (no runtime fetch — see NOTE 2).
  const geos = useMemo(
    () => africaGeo.features.filter((f) => AFRICA_IDS.has(+f.id)),
    []
  );

  // Observe visibility so we can pause animation when off-screen.
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { rootMargin: '80px 0px', threshold: 0.05 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const syncReduceMotion = () => setReduceMotion(Boolean(media?.matches));
    syncReduceMotion();
    if (media?.addEventListener) {
      media.addEventListener('change', syncReduceMotion);
      return () => media.removeEventListener('change', syncReduceMotion);
    }
    media?.addListener(syncReduceMotion);
    return () => media?.removeListener(syncReduceMotion);
  }, []);

  useEffect(() => {
    if (!inView) return undefined;
    if (reduceMotion) {
      // Skip motion; keep a strong but static final frame.
      phaseRef.current = 0;
      setFrame(withPulse({ redCount: N, view: VIEW_CAPE, pinT: 1 }, 0));
      return undefined;
    }
    if (!isVisible) return undefined;

    const start = performance.now() - phaseRef.current;
    const tick = (now) => {
      const phase = (now - start) % CYCLE;
      phaseRef.current = phase;
      if (now - lastFrameTsRef.current >= FRAME_INTERVAL_MS) {
        lastFrameTsRef.current = now;
        setFrame(frameAt(phase));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [inView, isVisible, reduceMotion]);

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
            <circle
              cx="0"
              cy="0"
              r={20 + pulseT * 10}
              fill="none"
              stroke="#ff3b3b"
              strokeWidth="1.8"
              style={{ opacity: pinT * (1 - pulseT) * 0.85 }}
            />
            <circle
              cx="0"
              cy="0"
              r={15 + pulseT * 7}
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.2"
              style={{ opacity: pinT * (1 - pulseT) * 0.45 }}
            />
            {/* Proto Trading badge — logo + name where the camera lands */}
            <clipPath id="protoLogoClip">
              <circle cx="0" cy="0" r="16" />
            </clipPath>
            <g style={{ opacity: pinT }}>
              <circle cx="0" cy="0" r="18" fill="#fff" />
              <image
                href={PROTO_ICON_SOURCES[logoIndex]}
                x={-16}
                y={-16}
                width={32}
                height={32}
                clipPath="url(#protoLogoClip)"
                preserveAspectRatio="xMidYMid slice"
                onError={() => {
                  setLogoIndex((index) => Math.min(index + 1, PROTO_ICON_SOURCES.length - 1));
                }}
              />
            </g>
            <text
              y="34"
              textAnchor="middle"
              style={{
                fill: '#fff',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 800,
                fontSize: '14px',
                letterSpacing: '0.5px',
                opacity: pinT,
                paintOrder: 'stroke',
                stroke: '#000',
                strokeWidth: '3px',
              }}
            >
              Proto Trading Online
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

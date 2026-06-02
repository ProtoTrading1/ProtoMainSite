import { useEffect, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const SADC_IDS = new Set([24, 72, 426, 454, 508, 516, 710, 748, 894, 716, 834, 180]);
const HIGHLIGHT_SEQ = [24, 180, 894, 454, 508, 516, 72, 716, 748, 426, 834, 710];

export default function SouthernAfricaMap() {
  const [lit, setLit] = useState(new Set());
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

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
      { rootMargin: '100px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return undefined;
    let i = 0;
    const timer = setInterval(() => {
      if (i >= HIGHLIGHT_SEQ.length) {
        clearInterval(timer);
        return;
      }
      setLit((prev) => new Set([...prev, HIGHLIGHT_SEQ[i]]));
      i += 1;
    }, 160);
    return () => clearInterval(timer);
  }, [inView]);

  return (
    <div ref={ref} className="lp-map-inner">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [25, -22], scale: 680 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies
              .filter((g) => SADC_IDS.has(+g.id))
              .map((geo) => {
                const id = +geo.id;
                const isSA = id === 710;
                const isLit = lit.has(id);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isLit ? (isSA ? '#ffffff' : '#8B1A1A') : '#1a0505'}
                    stroke="#000"
                    strokeWidth={1}
                    style={{
                      default: { outline: 'none', transition: 'fill 0.5s ease' },
                      hover: { outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}

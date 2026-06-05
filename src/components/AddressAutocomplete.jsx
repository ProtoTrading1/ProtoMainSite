import { useEffect, useRef } from 'react';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

let scriptPromise = null;

function loadScript() {
  if (!MAPS_KEY) return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { scriptPromise = null; resolve(false); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function AddressAutocomplete({ value, onChange, className, placeholder, required, style }) {
  const inputRef = useRef(null);
  const acRef = useRef(null);

  useEffect(() => {
    loadScript().then((loaded) => {
      if (!loaded || !inputRef.current || acRef.current) return;

      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'za' },
        fields: ['formatted_address', 'address_components'],
      });

      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place?.address_components) return;

        // Build a clean address string from components
        const get = (type) =>
          place.address_components.find((c) => c.types.includes(type))?.long_name || '';

        const streetNumber = get('street_number');
        const route = get('route');
        const suburb = get('sublocality_level_1') || get('locality');
        const city = get('administrative_area_level_2') || get('locality');
        const province = get('administrative_area_level_1');
        const postcode = get('postal_code');

        const street = [streetNumber, route].filter(Boolean).join(' ');
        const parts = [street, suburb, city !== suburb ? city : '', province, postcode].filter(Boolean);
        onChange([...new Set(parts)].join(', '));
      });

      acRef.current = ac;
    });

    return () => {
      if (acRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(acRef.current);
        acRef.current = null;
      }
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      placeholder={placeholder || 'Start typing your address…'}
      required={required}
      autoComplete="off"
      style={style}
    />
  );
}

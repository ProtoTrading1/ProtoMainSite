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

import { parseGooglePlaceComponents } from '../lib/addressUtils';

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  className,
  placeholder,
  required,
  style,
  onKeyDown,
  id,
  name,
  autoComplete = 'street-address',
  ariaRequired,
  ariaInvalid,
}) {
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

        const parts = parseGooglePlaceComponents(place.address_components);
        onChange(parts.formatted);
        onPlaceSelect?.(parts);
      });

      acRef.current = ac;
    });

    return () => {
      if (acRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(acRef.current);
        acRef.current = null;
      }
    };
  }, [onChange, onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      placeholder={placeholder || 'Start typing your address…'}
      required={required}
      aria-required={ariaRequired}
      aria-invalid={ariaInvalid}
      autoComplete={autoComplete}
      style={style}
      onKeyDown={onKeyDown}
    />
  );
}

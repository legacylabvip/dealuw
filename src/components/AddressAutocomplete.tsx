'use client';

import { useEffect, useRef, useState } from 'react';

interface AddressResult {
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
}

function loadGooglePlaces(apiKey: string): Promise<void> {
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    // Already loading
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Places'));
    document.head.appendChild(script);
  });
}

function parsePlace(place: google.maps.places.PlaceResult): AddressResult {
  const components = place.address_components || [];
  const get = (type: string) => components.find(c => c.types.includes(type));

  const streetNumber = get('street_number')?.long_name || '';
  const route = get('route')?.long_name || '';
  const city = get('locality')?.long_name || get('sublocality')?.long_name || get('administrative_area_level_3')?.long_name || '';
  const state = get('administrative_area_level_1')?.short_name || '';
  const zip = get('postal_code')?.long_name || '';

  return {
    address: `${streetNumber} ${route}`.trim(),
    city,
    state,
    zip,
  };
}

export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);
  const lastExternalValue = useRef(value);

  // Load Google Places on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/config/google-places')
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.apiKey) {
          return loadGooglePlaces(d.apiKey.trim());
        }
      })
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Initialize autocomplete
  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;
    if (!window.google?.maps?.places) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.address_components) return;
      const result = parsePlace(place);
      // Update input to show just the street address
      if (inputRef.current) {
        inputRef.current.value = result.address;
      }
      lastExternalValue.current = result.address;
      onChange(result.address);
      onSelect(result);
    });

    autocompleteRef.current = ac;
  }, [ready, onChange, onSelect]);

  // Only sync from parent if the value was changed externally (not by typing)
  useEffect(() => {
    if (value !== lastExternalValue.current) {
      lastExternalValue.current = value;
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.value = value;
      }
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder || 'Enter property address...'}
      defaultValue={value}
      onChange={e => {
        lastExternalValue.current = e.target.value;
        onChange(e.target.value);
      }}
      className={className}
      autoComplete="off"
    />
  );
}

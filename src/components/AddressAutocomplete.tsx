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
  if (window.google?.maps?.places) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const check = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(check); resolve(); }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      const check = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(check); resolve(); }
      }, 100);
    };
    script.onerror = () => reject(new Error('Failed to load Google Places'));
    document.head.appendChild(script);
  });
}

function parsePlace(place: google.maps.places.PlaceResult): AddressResult {
  const components = place.address_components || [];
  const get = (type: string) => components.find(c => c.types.includes(type));

  return {
    address: `${get('street_number')?.long_name || ''} ${get('route')?.long_name || ''}`.trim(),
    city: get('locality')?.long_name || get('sublocality')?.long_name || '',
    state: get('administrative_area_level_1')?.short_name || '',
    zip: get('postal_code')?.long_name || '',
  };
}

export default function AddressAutocomplete({ onChange, onSelect, placeholder, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);

  // Load Google Places
  useEffect(() => {
    let cancelled = false;
    fetch('/api/config/google-places')
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.apiKey) return loadGooglePlaces(d.apiKey.trim());
      })
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Init autocomplete
  useEffect(() => {
    if (!ready || !inputRef.current || acRef.current) return;
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
      if (inputRef.current) inputRef.current.value = result.address;
      onChange(result.address);
      onSelect(result);
    });

    acRef.current = ac;
  }, [ready, onChange, onSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder || 'Enter property address...'}
      onInput={e => onChange((e.target as HTMLInputElement).value)}
      className={className}
      autoComplete="off"
    />
  );
}

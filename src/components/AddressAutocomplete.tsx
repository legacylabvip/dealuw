'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

declare global {
  interface Window {
    google?: typeof google;
    _googlePlacesLoaded?: boolean;
    _googlePlacesCallbacks?: (() => void)[];
  }
}

function loadGooglePlaces(apiKey: string): Promise<void> {
  if (window._googlePlacesLoaded && window.google?.maps?.places) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (!window._googlePlacesCallbacks) {
      window._googlePlacesCallbacks = [];

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=_initGooglePlaces`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Failed to load Google Places'));

      (window as unknown as Record<string, () => void>)._initGooglePlaces = () => {
        window._googlePlacesLoaded = true;
        window._googlePlacesCallbacks?.forEach(cb => cb());
        window._googlePlacesCallbacks = [];
      };

      document.head.appendChild(script);
    }

    if (window._googlePlacesLoaded) {
      resolve();
    } else {
      window._googlePlacesCallbacks!.push(resolve);
    }
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
  const [placesReady, setPlacesReady] = useState(false);

  // Load Google Places script on mount
  useEffect(() => {
    fetch('/api/config/google-places')
      .then(r => r.json())
      .then(d => {
        if (d.apiKey) {
          return loadGooglePlaces(d.apiKey.trim());
        }
      })
      .then(() => setPlacesReady(true))
      .catch(() => {
        // Places unavailable — input works as plain text field
      });
  }, []);

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.address_components) return;

    const result = parsePlace(place);
    // Update the parent with parsed address parts
    onChange(result.address);
    onSelect(result);
  }, [onChange, onSelect]);

  // Initialize autocomplete when ready
  useEffect(() => {
    if (!placesReady || !inputRef.current || !window.google?.maps?.places) return;
    if (autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });

    ac.addListener('place_changed', handlePlaceChanged);
    autocompleteRef.current = ac;

    return () => {
      google.maps.event.clearInstanceListeners(ac);
      autocompleteRef.current = null;
    };
  }, [placesReady, handlePlaceChanged]);

  // Sync React value to DOM input (Google may have changed it)
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder || 'Enter property address...'}
      defaultValue={value}
      onChange={e => onChange(e.target.value)}
      className={className}
      autoComplete="off"
    />
  );
}

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

  return new Promise((resolve) => {
    if (!window._googlePlacesCallbacks) {
      window._googlePlacesCallbacks = [];

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=_initGooglePlaces`;
      script.async = true;
      script.defer = true;

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
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Fetch API key from server
  useEffect(() => {
    fetch('/api/config/google-places')
      .then(r => r.json())
      .then(d => { if (d.apiKey) setApiKey(d.apiKey); })
      .catch(() => {});
  }, []);

  // Load Google Places script
  useEffect(() => {
    if (!apiKey) return;
    loadGooglePlaces(apiKey).then(() => setLoaded(true));
  }, [apiKey]);

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.address_components) return;

    const result = parsePlace(place);
    onSelect(result);
  }, [onSelect]);

  // Initialize autocomplete
  useEffect(() => {
    if (!loaded || !inputRef.current || autocompleteRef.current) return;

    const ac = new window.google!.maps.places.Autocomplete(inputRef.current, {
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
  }, [loaded, handlePlaceChanged]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder || 'Enter property address...'}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className}
    />
  );
}

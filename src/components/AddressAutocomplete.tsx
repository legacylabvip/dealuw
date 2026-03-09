'use client';

import { useState, useRef, useEffect } from 'react';

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

interface Prediction {
  description: string;
  place_id: string;
}

export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: Props) {
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get API key on mount
  useEffect(() => {
    fetch('/api/config/google-places')
      .then(r => r.json())
      .then(d => { if (d.apiKey) setApiKey(d.apiKey.trim()); })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = (input: string) => {
    if (!apiKey || input.length < 3) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(input)}`
        );
        const data = await res.json();
        if (data.predictions?.length > 0) {
          setSuggestions(data.predictions);
          setShowDropdown(true);
        } else {
          setSuggestions([]);
          setShowDropdown(false);
        }
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const selectSuggestion = async (prediction: Prediction) => {
    setShowDropdown(false);
    setSuggestions([]);

    try {
      const res = await fetch(
        `/api/places/details?place_id=${encodeURIComponent(prediction.place_id)}`
      );
      const data = await res.json();

      if (data.result) {
        onChange(data.result.address);
        onSelect(data.result);
      } else {
        // Fallback: parse from description string
        const parts = prediction.description.split(',').map(s => s.trim());
        const address = parts[0] || '';
        const city = parts[1] || '';
        const stateZip = (parts[2] || '').split(' ');
        onChange(address);
        onSelect({
          address,
          city,
          state: stateZip[0] || '',
          zip: stateZip[1] || '',
        });
      }
    } catch {
      // Fallback: parse description
      const parts = prediction.description.split(',').map(s => s.trim());
      onChange(parts[0] || '');
      onSelect({
        address: parts[0] || '',
        city: parts[1] || '',
        state: (parts[2] || '').split(' ')[0] || '',
        zip: (parts[2] || '').split(' ')[1] || '',
      });
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder={placeholder || 'Enter property address...'}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        className={className}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-border bg-card shadow-2xl z-[10000] overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.place_id || i}
              type="button"
              className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-border/50 transition-colors border-b border-border last:border-b-0"
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
            >
              <span className="text-accent font-medium">
                {s.description.split(',')[0]}
              </span>
              <span className="text-muted">
                ,{s.description.split(',').slice(1).join(',')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

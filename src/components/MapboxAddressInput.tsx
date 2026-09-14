'use client';

import { useState, useCallback, useRef } from 'react';
import { t } from '@/lib/translations';
import { useLanguage } from '@/lib/language-context';

interface GeocodingFeature {
  place_name: string;
  geometry: { coordinates: [number, number] };
  context?: { id: string; text: string }[];
}

export interface SelectedAddress {
  address: string;
  latitude: number;
  longitude: number;
  postalCode: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface MapboxAddressInputProps {
  onSelect: (address: SelectedAddress) => void;
  disabled?: boolean;
}

export function MapboxAddressInput({ onSelect, disabled }: Readonly<MapboxAddressInputProps>) {
  const { language } = useLanguage();
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputValue(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=ES&types=address&language=es&limit=5`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json() as { features: GeocodingFeature[] };
        setSuggestions(data.features ?? []);
      } catch { /* silent */ }
    }, 300);
  }, []);

  const handleSelectSuggestion = useCallback((feature: GeocodingFeature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const postalCode = feature.context?.find((c) => c.id.startsWith('postcode'))?.text ?? '';
    setInputValue(feature.place_name);
    setSuggestions([]);
    onSelect({ address: feature.place_name, latitude: lat, longitude: lng, postalCode });
  }, [onSelect]);

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        disabled={disabled}
        placeholder={t('deliveryAddressPlaceholder', language)}
        className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-[200] rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.place_name}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-colors"
                onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
              >
                {s.place_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

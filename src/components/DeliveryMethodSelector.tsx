'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Store } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface GeocodingFeature {
  place_name: string;
  geometry: { coordinates: [number, number] };
  context?: { id: string; text: string }[];
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface DeliveryData {
  address: string;
  latitude: number;
  longitude: number;
  postalCode: string;
  estimatedFeeCents: number;
}

interface DeliveryMethodSelectorProps {
  value: 'recogida' | 'delivery' | null;
  onChange: (method: 'recogida' | 'delivery', deliveryData?: DeliveryData) => void;
  orderTotalCents: number;
  disabled?: boolean;
  deliveryHabilitado?: boolean;
}


export function DeliveryMethodSelector({
  value,
  onChange,
  orderTotalCents,
  disabled,
  deliveryHabilitado = false,
}: Readonly<DeliveryMethodSelectorProps>) {
  const { language } = useLanguage();

  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [selectedLatitude, setSelectedLatitude] = useState<number | null>(null);
  const [selectedLongitude, setSelectedLongitude] = useState<number | null>(null);
  const [selectedPostalCode, setSelectedPostalCode] = useState('');
  const [estimatedFeeCents, setEstimatedFeeCents] = useState<number | null>(null);
  const [loadingFee, setLoadingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-select recogida when it's the only available method
  useEffect(() => {
    if (!deliveryHabilitado && value === null) {
      onChange('recogida');
    }
  }, [deliveryHabilitado, value, onChange]);

  // Clear state when method changes away from delivery
  useEffect(() => {
    if (value !== 'delivery') {
      setInputValue('');
      setSuggestions([]);
      setSelectedAddress('');
      setSelectedLatitude(null);
      setSelectedLongitude(null);
      setSelectedPostalCode('');
      setEstimatedFeeCents(null);
      setFeeError(null);
    }
  }, [value]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputValue(q);
    setSelectedAddress('');
    setEstimatedFeeCents(null);
    setFeeError(null);
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
    setSelectedAddress(feature.place_name);
    setSelectedLatitude(lat);
    setSelectedLongitude(lng);
    setSelectedPostalCode(postalCode);
    setSuggestions([]);
    setEstimatedFeeCents(null);
    setFeeError(null);
  }, []);

  const handleFetchFee = useCallback(async () => {
    if (selectedLatitude === null || selectedLongitude === null || !selectedAddress) return;
    setLoadingFee(true);
    setFeeError(null);
    try {
      const res = await fetch('/api/glovo/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: selectedAddress,
          latitude: selectedLatitude,
          longitude: selectedLongitude,
          orderTotalCents,
        }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        const code = data['code'] as string | undefined;
        if (code === 'DEL_002' || code === 'DLV_004') {
          setFeeError(t('errorDeliveryMinOrder', language));
        } else if (code === 'DEL_001') {
          setFeeError(t('errorDeliveryZoneRestricted', language));
        } else if (code === 'GLV_003') {
          setFeeError(t('errorGlovoNotConfigured', language));
        } else {
          setFeeError((data['message'] as string | undefined) ?? t('errorGlovoQuoteFailed', language));
        }
        return;
      }
      const feeCents = (data['estimatedDeliveryFeeCents'] as number | undefined) ?? 0;
      setEstimatedFeeCents(feeCents);
      onChange('delivery', {
        address: selectedAddress,
        latitude: selectedLatitude,
        longitude: selectedLongitude,
        postalCode: selectedPostalCode,
        estimatedFeeCents: feeCents,
      });
    } catch {
      setFeeError(t('connectionError', language));
    } finally {
      setLoadingFee(false);
    }
  }, [selectedAddress, selectedLatitude, selectedLongitude, selectedPostalCode, orderTotalCents, language, onChange]);

  const canFetchFee =
    value === 'delivery' &&
    selectedLatitude !== null &&
    selectedLongitude !== null &&
    !loadingFee;

  return (
    <div className="space-y-3 mb-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t('deliveryMethodTitle', language)}
      </p>

      <div className={`grid gap-2 ${deliveryHabilitado ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button
          type="button"
          onClick={() => onChange('recogida')}
          disabled={disabled}
          className={`
            flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 min-h-[64px] text-sm font-medium transition-all duration-150
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${value === 'recogida'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40'}
          `}
          aria-pressed={value === 'recogida'}
        >
          <Store className="size-5 shrink-0" aria-hidden="true" />
          <span className="text-center leading-tight">{t('deliveryMethodPickup', language)}</span>
        </button>

        {deliveryHabilitado && (
          <button
            type="button"
            onClick={() => onChange('delivery')}
            disabled={disabled}
            className={`
              flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 min-h-[64px] text-sm font-medium transition-all duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${value === 'delivery'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40'}
            `}
            aria-pressed={value === 'delivery'}
          >
            <MapPin className="size-5 shrink-0" aria-hidden="true" />
            <span className="text-center leading-tight">{t('deliveryMethodHome', language)}</span>
          </button>
        )}
      </div>

      {value === 'delivery' && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            {t('deliveryAddress', language)}
          </label>

          <div className="relative">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
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

          {feeError && (
            <p role="alert" className="text-xs text-destructive">
              {feeError}
            </p>
          )}

          {estimatedFeeCents !== null ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary font-medium">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {t('deliveryFeeLabel', language)}: {(estimatedFeeCents / 100).toFixed(2)}€
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleFetchFee}
              disabled={!canFetchFee || disabled}
              className="w-full min-h-[44px] rounded-lg border border-primary bg-primary/10 text-primary text-sm font-medium transition-all duration-150 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2"
            >
              {loadingFee
                ? t('deliveryQuoteLoading', language)
                : t('deliverySeeFee', language)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

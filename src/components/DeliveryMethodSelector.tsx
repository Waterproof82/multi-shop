'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, Store } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { MapboxAddressInput } from './MapboxAddressInput';

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

  const [selectedAddress, setSelectedAddress] = useState('');
  const [selectedLatitude, setSelectedLatitude] = useState<number | null>(null);
  const [selectedLongitude, setSelectedLongitude] = useState<number | null>(null);
  const [selectedPostalCode, setSelectedPostalCode] = useState('');
  const [estimatedFeeCents, setEstimatedFeeCents] = useState<number | null>(null);
  const [loadingFee, setLoadingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

  // Auto-select recogida when it's the only available method
  useEffect(() => {
    if (!deliveryHabilitado && value === null) {
      onChange('recogida');
    }
  }, [deliveryHabilitado, value, onChange]);

  // Clear state when method changes away from delivery
  useEffect(() => {
    if (value !== 'delivery') {
      setSelectedAddress('');
      setSelectedLatitude(null);
      setSelectedLongitude(null);
      setSelectedPostalCode('');
      setEstimatedFeeCents(null);
      setFeeError(null);
    }
  }, [value]);

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

          <MapboxAddressInput
            onInputChange={() => {
              setSelectedAddress('');
              setEstimatedFeeCents(null);
              setFeeError(null);
            }}
            onSelect={({ address, latitude, longitude, postalCode }) => {
              setSelectedAddress(address);
              setSelectedLatitude(latitude);
              setSelectedLongitude(longitude);
              setSelectedPostalCode(postalCode);
              setEstimatedFeeCents(null);
              setFeeError(null);
            }}
          />

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

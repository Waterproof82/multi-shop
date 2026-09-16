'use client';

import { useCallback, useState } from 'react';
import { formatPrice } from '@/lib/format-price';
import { t } from '@/lib/translations';
import { useLanguage } from '@/lib/language-context';
import { emojiDeIcono, formatRangoHorasModalidad } from '@/lib/modalidad-entrega-iconos';
import { MapboxAddressInput, type SelectedAddress } from './MapboxAddressInput';

type Lang = Parameters<typeof t>[1];

export interface ModalidadEntregaPublica {
  id: string;
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre: string;
  precioCents: number;
  tiempoMinMinutos: number | null;
  tiempoMaxMinutos: number | null;
  activo: boolean;
  orden: number;
}

/** Recoger en local: fijo en el código, gratis, sin fila en la DB. */
const RECOGIDA_FIJA = {
  id: null as string | null,
  icono: 'store',
  precioCents: 0,
  tiempoMinMinutos: null as number | null,
  tiempoMaxMinutos: null as number | null,
};

export function debeMostrarSelector(
  envioHabilitado: boolean,
  modalidades: ModalidadEntregaPublica[]
): boolean {
  return envioHabilitado && modalidades.some((m) => m.tipo === 'domicilio' && m.activo);
}

function columnaDerecha(precioCents: number, language: Lang): string {
  if (precioCents === 0) return t('tiendaGratisLabel', language);
  return formatPrice(precioCents / 100, 'EUR', language);
}

interface TiendaFulfillmentSelectorProps {
  envioHabilitado: boolean;
  modalidades: ModalidadEntregaPublica[];
  value: 'recogida' | 'domicilio' | null;
  onChange: (tipo: 'recogida' | 'domicilio', modalidadId: string | null, precioCents: number) => void;
  onAddressSelect: (address: SelectedAddress) => void;
  disabled?: boolean;
}

export function TiendaFulfillmentSelector({
  envioHabilitado,
  modalidades,
  onChange,
  onAddressSelect,
  disabled,
}: Readonly<TiendaFulfillmentSelectorProps>) {
  const { language } = useLanguage();
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState<string | null>(null);

  const handleAddressSelect = useCallback(
    (address: SelectedAddress) => onAddressSelect(address),
    [onAddressSelect]
  );

  const modalidadesDomicilio = modalidades.filter((m) => m.tipo === 'domicilio' && m.activo);
  if (!envioHabilitado || modalidadesDomicilio.length === 0) return null;

  // "Recoger en local" está preseleccionado mientras no se haya tocado
  // manualmente ninguna fila (`modalidadSeleccionada === null`) — mismo
  // patrón de fallback que ya usaba este componente para domicilio.
  const idSeleccionado = modalidadSeleccionada ?? null;

  const handleClickRecogida = () => {
    setModalidadSeleccionada(RECOGIDA_FIJA.id);
    onChange('recogida', null, 0);
  };

  const handleClickDomicilio = (m: ModalidadEntregaPublica) => {
    setModalidadSeleccionada(m.id);
    onChange('domicilio', m.id, m.precioCents);
  };

  return (
    <div className="space-y-3 mb-3">
      <ul className="space-y-1.5">
        <li>
          <button
            type="button"
            onClick={handleClickRecogida}
            className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left ${idSeleccionado === RECOGIDA_FIJA.id ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <span className="text-lg leading-none">{emojiDeIcono(RECOGIDA_FIJA.icono)}</span>
            <span className="flex-1 font-semibold">{t('tiendaPickupTab', language)}</span>
            <span className="text-xs text-muted-foreground text-right shrink-0">
              {t('tiendaGratisLabel', language)}
            </span>
          </button>
        </li>
        {modalidadesDomicilio.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => handleClickDomicilio(m)}
              className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left ${idSeleccionado === m.id ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <span className="text-lg leading-none">{emojiDeIcono(m.icono)}</span>
              <span className="flex-1 font-semibold">{m.nombre}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {columnaDerecha(m.precioCents, language)}
                </span>
                {m.tiempoMinMinutos !== null && m.tiempoMaxMinutos !== null && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span aria-hidden="true">🕐</span>
                    {formatRangoHorasModalidad(m.tiempoMinMinutos, m.tiempoMaxMinutos, language)}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {idSeleccionado !== null && (
        <MapboxAddressInput disabled={disabled} onSelect={handleAddressSelect} />
      )}
    </div>
  );
}

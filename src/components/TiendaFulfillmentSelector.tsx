'use client';

import { useCallback, useId, useState, type ReactNode } from 'react';
import { Bike, Car, Clock, Package, Store, Timer, type LucideIcon } from 'lucide-react';
import { formatPrice } from '@/lib/format-price';
import { t } from '@/lib/translations';
import { useLanguage } from '@/lib/language-context';
import { formatRangoHorasModalidad } from '@/lib/modalidad-entrega-iconos';
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

// Icono de linea por clave guardada en DB (`ICONOS_MODALIDAD_ENTREGA.value`).
// El emoji de esa tabla sigue sirviendo al selector del admin; aqui, en el
// carrito, un icono de linea casa con el resto y no cambia segun el sistema.
const ICONO_LUCIDE: Record<string, LucideIcon> = {
  store: Store,
  bike: Bike,
  car: Car,
  package: Package,
  clock: Timer,
};

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

// Seleccionada: borde y fondo del tenant, bien visibles (no un 5% casi invisible).
function opcionClass(seleccionada: boolean): string {
  if (seleccionada) return 'border-primary bg-primary/10';
  return 'border-foreground/15 hover:border-foreground/40';
}

function indicadorClass(seleccionada: boolean): string {
  if (seleccionada) return 'border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]';
  return 'border-foreground/30';
}

interface OpcionEnvioProps {
  icono: string;
  nombre: string;
  precio: string;
  plazo: ReactNode;
  seleccionada: boolean;
  onClick: () => void;
}

/**
 * Una fila del selector: icono · nombre (con el plazo debajo) · precio en
 * pastilla · indicador de seleccion. Nombre y plazo apilados para que los
 * nombres largos ("Battery Express PROVINCIA TENERIFE") no se peleen con el
 * precio en la misma linea.
 */
function OpcionEnvio({ icono, nombre, precio, plazo, seleccionada, onClick }: Readonly<OpcionEnvioProps>) {
  const Icono = ICONO_LUCIDE[icono];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionada}
      className={`flex min-h-[56px] w-full items-center gap-3 rounded-[3px] border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${opcionClass(seleccionada)}`}
    >
      {Icono && <Icono data-icono={icono} className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-foreground">{nombre}</span>
        {plazo}
      </span>
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
        {precio}
      </span>
      <span aria-hidden="true" className={`size-4 shrink-0 rounded-full border-2 transition-colors ${indicadorClass(seleccionada)}`} />
    </button>
  );
}

function PlazoEntrega({ m, language }: Readonly<{ m: ModalidadEntregaPublica; language: Lang }>) {
  if (m.tiempoMinMinutos === null || m.tiempoMaxMinutos === null) return null;
  return (
    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{formatRangoHorasModalidad(m.tiempoMinMinutos, m.tiempoMaxMinutos, language)}</span>
    </span>
  );
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
  const tituloId = useId();
  const direccionId = useId();

  const handleAddressSelect = useCallback(
    (address: SelectedAddress) => onAddressSelect(address),
    [onAddressSelect]
  );

  const modalidadesDomicilio = modalidades
    .filter((m) => m.tipo === 'domicilio' && m.activo)
    .sort((a, b) => a.precioCents - b.precioCents);
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
    <section aria-labelledby={tituloId} className="mb-4 mt-4 space-y-3 border-t border-foreground/10 pt-4">
      <h3 id={tituloId} className="font-serif text-lg font-normal leading-tight text-foreground">
        {t('deliveryMethodTitle', language)}
      </h3>
      <ul aria-labelledby={tituloId} className="space-y-2">
        <li>
          <OpcionEnvio
            icono={RECOGIDA_FIJA.icono}
            nombre={t('tiendaPickupTab', language)}
            precio={t('tiendaGratisLabel', language)}
            plazo={null}
            seleccionada={idSeleccionado === RECOGIDA_FIJA.id}
            onClick={handleClickRecogida}
          />
        </li>
        {modalidadesDomicilio.map((m) => (
          <li key={m.id}>
            <OpcionEnvio
              icono={m.icono}
              nombre={m.nombre}
              precio={columnaDerecha(m.precioCents, language)}
              plazo={<PlazoEntrega m={m} language={language} />}
              seleccionada={idSeleccionado === m.id}
              onClick={() => handleClickDomicilio(m)}
            />
          </li>
        ))}
      </ul>

      {idSeleccionado !== null && (
        <div className="space-y-1.5 pt-1">
          <label htmlFor={direccionId} className="block text-xs font-medium text-muted-foreground">
            {t('deliveryAddress', language)}
          </label>
          <MapboxAddressInput id={direccionId} disabled={disabled} onSelect={handleAddressSelect} />
        </div>
      )}
    </section>
  );
}

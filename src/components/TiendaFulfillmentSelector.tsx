'use client';

import { useCallback, useState } from 'react';
import { formatPrice } from '@/lib/format-price';
import { useLanguage } from '@/lib/language-context';
import { MapboxAddressInput, type SelectedAddress } from './MapboxAddressInput';

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

/**
 * Un tipo se muestra solo si su toggle está encendido Y tiene al menos una
 * modalidad activa — evita un tab vacío si el admin prendió el toggle pero
 * todavía no cargó ninguna modalidad.
 */
export function debeMostrarSelector(
  recogidaHabilitada: boolean,
  envioHabilitado: boolean,
  modalidades: ModalidadEntregaPublica[]
): boolean {
  const hayRecogida = recogidaHabilitada && modalidades.some((m) => m.tipo === 'recogida' && m.activo);
  const hayDomicilio = envioHabilitado && modalidades.some((m) => m.tipo === 'domicilio' && m.activo);
  return hayRecogida || hayDomicilio;
}

/**
 * Modalidades del tab activo, acotadas a los flags de visibilidad reales
 * (no solo a `value`): si el padre alguna vez pasa un `value` para un tab
 * que no está visible (drift de estado), no hay que mostrar ni su lista de
 * precios ni el input de dirección — el botón de ese tab ni siquiera existe.
 */
function modalidadesParaTab(
  value: 'recogida' | 'domicilio' | null,
  mostrarRecogida: boolean,
  mostrarDomicilio: boolean,
  modalidadesRecogida: ModalidadEntregaPublica[],
  modalidadesDomicilio: ModalidadEntregaPublica[]
): ModalidadEntregaPublica[] {
  if (value === 'domicilio' && mostrarDomicilio) return modalidadesDomicilio;
  if (mostrarRecogida) return modalidadesRecogida;
  return [];
}

interface TiendaFulfillmentSelectorProps {
  recogidaHabilitada: boolean;
  envioHabilitado: boolean;
  modalidades: ModalidadEntregaPublica[];
  value: 'recogida' | 'domicilio' | null;
  onChange: (tipo: 'recogida' | 'domicilio', modalidadId: string, precioCents: number) => void;
  onAddressSelect: (address: SelectedAddress) => void;
  disabled?: boolean;
}

export function TiendaFulfillmentSelector({
  recogidaHabilitada,
  envioHabilitado,
  modalidades,
  value,
  onChange,
  onAddressSelect,
  disabled,
}: Readonly<TiendaFulfillmentSelectorProps>) {
  const { language } = useLanguage();
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState<string | null>(null);

  // A diferencia de DeliveryMethodSelector (que cotiza una tarifa Glovo que
  // puede quedar obsoleta al teclear una nueva dirección), este selector no
  // tiene ningún estado derivado del texto del input: el precio de cada
  // modalidad ya es fijo (viene de `modalidades`). Por eso no usa
  // `onInputChange`.
  const handleAddressSelect = useCallback(
    (address: SelectedAddress) => onAddressSelect(address),
    [onAddressSelect]
  );

  const modalidadesRecogida = modalidades.filter((m) => m.tipo === 'recogida' && m.activo);
  const modalidadesDomicilio = modalidades.filter((m) => m.tipo === 'domicilio' && m.activo);
  const mostrarRecogida = recogidaHabilitada && modalidadesRecogida.length > 0;
  const mostrarDomicilio = envioHabilitado && modalidadesDomicilio.length > 0;

  if (!mostrarRecogida && !mostrarDomicilio) return null;

  const modalidadesDelTab = modalidadesParaTab(value, mostrarRecogida, mostrarDomicilio, modalidadesRecogida, modalidadesDomicilio);

  // Fallback a la primera modalidad de la lista: al hacer click en un tab,
  // `onChange` ya se dispara con `modalidadesXxx[0]`, pero `setModalidadSeleccionada`
  // solo lo actualizan los botones de la lista — sin este fallback la fila
  // "efectiva" (la que ya recibió el padre) no se ve resaltada hasta el
  // próximo click, y al cambiar de tab puede quedar resaltada una modalidad
  // de OTRO tab.
  const idSeleccionado = modalidadSeleccionada ?? modalidadesDelTab[0]?.id ?? null;

  return (
    <div className="space-y-3 mb-3">
      <div className={`grid gap-2 ${mostrarRecogida && mostrarDomicilio ? 'grid-cols-2' : 'grid-cols-1'}`} role="tablist">
        {mostrarRecogida && (
          <button
            type="button"
            role="tab"
            aria-selected={value === 'recogida'}
            onClick={() => onChange('recogida', modalidadesRecogida[0].id, modalidadesRecogida[0].precioCents)}
            disabled={disabled}
            className={`rounded-xl border-2 px-3 py-3 text-sm font-medium ${value === 'recogida' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
          >
            Recoger en tienda
          </button>
        )}
        {mostrarDomicilio && (
          <button
            type="button"
            role="tab"
            aria-selected={value === 'domicilio'}
            onClick={() => onChange('domicilio', modalidadesDomicilio[0].id, modalidadesDomicilio[0].precioCents)}
            disabled={disabled}
            className={`rounded-xl border-2 px-3 py-3 text-sm font-medium ${value === 'domicilio' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
          >
            Envío a domicilio
          </button>
        )}
      </div>

      {value && modalidadesDelTab.length > 0 && (
        <ul className="space-y-1.5">
          {modalidadesDelTab.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => { setModalidadSeleccionada(m.id); onChange(value, m.id, m.precioCents); }}
                className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left ${idSeleccionado === m.id ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <span>{m.nombre}</span>
                <span className="ml-auto text-muted-foreground">{formatPrice(m.precioCents / 100, 'EUR', language)}</span>
                {m.tiempoMinMinutos !== null && (
                  <span className="text-xs text-muted-foreground">{m.tiempoMinMinutos}-{m.tiempoMaxMinutos} min</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value === 'domicilio' && mostrarDomicilio && (
        <MapboxAddressInput disabled={disabled} onSelect={handleAddressSelect} />
      )}
    </div>
  );
}

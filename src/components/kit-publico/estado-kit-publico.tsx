// src/components/kit-publico/estado-kit-publico.tsx
// kit-expiry-m2a (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2a/)
// R-M2a.2: componente de SERVIDOR (sin 'use client', no envía JS al cliente).
// Solo pinta `estado`, ya resuelto por el cargador (M2a4) — ni toca red ni
// BD. `main` lo pone la página (DD11 de design.md): aquí solo `section`.
import { CheckCircle2 } from 'lucide-react';
import type { ElementoKitPublico, EstadoKitPublico as EstadoKitPublicoVM } from '@/core/domain/entities/kit-caducidad-types';
import type { EstadoElemento, EstadoGeneral } from '@/lib/kit-caducidad/estado';

interface Props {
  estado: EstadoKitPublicoVM;
}

// R-M2a.2.2: copy exacta por estado general.
function tituloGeneral(general: EstadoGeneral): string {
  if (general === 'al_dia') return 'Todo al día';
  if (general === 'caduca_pronto') return 'Algo caduca pronto';
  if (general === 'caducado') return 'Hay consumibles caducados';
  return 'Aún no tenemos las fechas de este kit';
}

// R-M2a.2.3: el estado de cada fila SIEMPRE en texto, nunca solo color.
function textoEstado(estado: EstadoElemento): string {
  if (estado === 'al_dia') return 'Al día';
  if (estado === 'caduca_pronto') return 'Caduca pronto';
  return 'Caducado';
}

// DD10 de design.md: es-ES largo sobre UTC, para que el día impreso no se
// desplace según la zona horaria de quien renderiza.
function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

// R-M2a.2.6: una sola acción principal; recambio si hay algo que reponer,
// la lista en los dos estados sin urgencia (al_dia / sin_datos todavía).
function accionEsRecambio(general: EstadoGeneral): boolean {
  return general === 'caduca_pronto' || general === 'caducado';
}

// R-M2a.2.3: cada parte del botiquín en su propia fila, con su etiqueta
// ("Botiquín — Gasas estériles"); el resto del catálogo no tiene partes.
function etiquetaFila(elemento: ElementoKitPublico): string {
  return elemento.parte ? `${elemento.consumible} — ${elemento.parte}` : elemento.consumible;
}

const ENLACE_BASE = 'min-h-11 inline-flex items-center justify-center rounded-md px-4 text-center font-medium';

export function EstadoKitPublico({ estado }: Readonly<Props>) {
  const esRecambio = accionEsRecambio(estado.general);
  const hrefPrincipal = esRecambio ? estado.enlaces.recambio : estado.enlaces.lista;
  const hrefSecundario = esRecambio ? estado.enlaces.lista : estado.enlaces.recambio;
  // R-M2a.2.7: todo mensaje de riesgo cierra con su salida — nunca "se cierra en sí mismo".
  const textoRecambio = 'Repón tu kit';
  const textoLista = 'Revisa la lista de tu mochila';

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">{estado.kitNombre}</h1>
      <p className="mt-1 text-sm text-foreground/70">Serie {estado.serie}</p>

      <p className="mt-6 flex items-center gap-2 text-lg font-medium text-foreground">
        {estado.general === 'al_dia' && <CheckCircle2 aria-hidden className="h-5 w-5 text-primary" />}
        {tituloGeneral(estado.general)}
      </p>

      {estado.elementos.length > 0 && (
        <ul className="mt-6 divide-y divide-border">
          {estado.elementos.map((elemento, indice) => (
            <li key={`${elemento.consumible}-${elemento.parte}-${indice}`} className="flex items-center justify-between py-3">
              <span>{etiquetaFila(elemento)}</span>
              <span className="text-right text-sm">
                <span className="block font-medium">{textoEstado(elemento.estado)}</span>
                <span className="block text-foreground/60">{formatearFecha(elemento.caducaEl)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a href={hrefPrincipal} className={`${ENLACE_BASE} bg-primary text-primary-foreground`}>
          {esRecambio ? textoRecambio : textoLista}
        </a>
        <a href={hrefSecundario} className={`${ENLACE_BASE} border border-border`}>
          {esRecambio ? textoLista : textoRecambio}
        </a>
      </div>
    </section>
  );
}

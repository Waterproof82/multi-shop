// src/components/kit-publico/gestion-avisos-kit.tsx
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// R-M2b.3.3/R-M2b.3.4: componente de CLIENTE para /kit/avisos/[token].
// Pendiente → confirmar (botón principal) o borrar (enlace secundario,
// "no he sido yo"); registrada → darse de baja. Las dos acciones llaman al
// MISMO endpoint `POST /api/kit-avisos/gestion` (R-M2b.3.5). Nunca recibe
// ni pinta el email del titular (R-M2b.6.1).
'use client';

import { useState } from 'react';
import type { EstadoAvisos } from '@/core/domain/entities/kit-avisos-types';

interface Props {
  token: string;
  serie: string;
  estado: EstadoAvisos;
}

type Accion = 'confirmar' | 'baja';

// R-M2b.3.6: mensaje final ÚNICO de la baja, sea cual sea el estado previo.
const MENSAJE_BAJA = 'Listo: no recibirás más avisos y hemos borrado tu email y tu teléfono.';
const MENSAJE_CONFIRMADO = 'Avisos confirmados. Te avisaremos 30 y 15 días antes de que caduque algún consumible.';

const BOTON_PRIMARIO = 'min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground';
const BOTON_SECUNDARIO = 'min-h-11 text-sm text-foreground/70 underline';

async function enviarAccion(token: string, accion: Accion): Promise<void> {
  await fetch('/api/kit-avisos/gestion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, accion }),
  });
}

export function GestionAvisosKit({ token, serie, estado }: Readonly<Props>) {
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function ejecutar(accion: Accion) {
    try {
      await enviarAccion(token, accion);
    } finally {
      setMensaje(accion === 'baja' ? MENSAJE_BAJA : MENSAJE_CONFIRMADO);
    }
  }

  if (mensaje) {
    return <p role="status" className="mt-6 text-sm text-foreground">{mensaje}</p>;
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Avisos del kit</h1>
      <p className="mt-1 text-sm text-foreground/70">{serie}</p>

      {estado === 'pendiente' ? (
        <div className="mt-8 flex flex-col items-start gap-4">
          <button type="button" onClick={() => ejecutar('confirmar')} className={BOTON_PRIMARIO}>
            Confirmar mis avisos
          </button>
          <button type="button" onClick={() => ejecutar('baja')} className={BOTON_SECUNDARIO}>
            No he sido yo: borra estos datos
          </button>
        </div>
      ) : (
        <div className="mt-8">
          <button type="button" onClick={() => ejecutar('baja')} className={BOTON_PRIMARIO}>
            Darme de baja y borrar mis datos
          </button>
          <p className="mt-3 max-w-md text-sm text-foreground/70">
            Dejarás de recibir avisos y tu email y tu teléfono se borran al momento.
          </p>
        </div>
      )}
    </section>
  );
}

'use client';

import { useState } from 'react';
import { PillSwitch } from '@/components/ui/pill-switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';
import {
  resumenLegalEmpresa,
  RETENCION_CLIENTES_CON_TPV_ANIOS,
  RETENCION_CLIENTES_SIN_TPV_ANIOS,
  type EstadoLegal,
  type LineaLegal,
} from '@/lib/empresa/tpv-legal';

interface Props {
  readonly empresaId: string;
  readonly nombre: string;
  readonly tpvHabilitado: boolean;
  readonly verifactuMode: string | null;
}

const PUNTO: Record<EstadoLegal, string> = {
  activo: 'bg-emerald-400',
  inactivo: 'bg-slate-400',
  aviso: 'bg-amber-400',
};

function Fila({ etiqueta, linea }: Readonly<{ etiqueta: string; linea: LineaLegal }>) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-slate-400 sm:w-40">{etiqueta}</dt>
      <dd className="flex items-start gap-2 text-white">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[linea.estado]}`} />
        <span>{linea.texto}</span>
      </dd>
    </div>
  );
}

function AvisoDesactivar() {
  return (
    <>
      <p>
        Sus empleados no podrán fichar ni cobrar, y la facturación pasará a su programa externo. Los fichajes y cobros
        ya registrados se conservan.
      </p>
      <p>
        <strong>Irreversible:</strong> en la próxima purga mensual, los datos personales de sus clientes con más de{' '}
        {RETENCION_CLIENTES_SIN_TPV_ANIOS} años sin actividad se anonimizarán (hoy se guardan {RETENCION_CLIENTES_CON_TPV_ANIOS}).
        Volver a activar el TPV no los recupera.
      </p>
    </>
  );
}

/**
 * Interruptor de TPV de la tabla de empresas. Cambiarlo en cualquier sentido
 * altera facturación, registro de jornada y retención de clientes: siempre se
 * muestra cómo queda la empresa y se pide confirmación antes de guardar.
 */
export function InterruptorTpv({ empresaId, nombre, tpvHabilitado, verifactuMode }: Props) {
  const [tpv, setTpv] = useState(tpvHabilitado);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const siguiente = !tpv;
  const resumen = resumenLegalEmpresa({ tpvHabilitado: siguiente, verifactuMode });
  const accion = siguiente ? 'Activar TPV' : 'Desactivar TPV';

  async function guardar() {
    setConfirmando(false);
    setError(null);
    setTpv(siguiente);
    setGuardando(true);
    try {
      const res = await fetchWithCsrf(`/api/superadmin/empresas/${empresaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tpv_habilitado: siguiente }),
      });
      if (!res.ok) throw new Error('respuesta no válida');
    } catch {
      setTpv(!siguiente);
      setError('No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <PillSwitch
        checked={tpv}
        disabled={guardando}
        onChange={() => setConfirmando(true)}
        ariaLabel={`TPV de ${nombre}`}
        size="sm"
      />
      {error !== null && <p role="alert" className="max-w-[10rem] text-xs text-red-300">{error}</p>}
      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent role="alertdialog" className="border-white/20 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>¿{accion} de {nombre}?</DialogTitle>
            <DialogDescription className="text-slate-300">Así quedará la empresa tras el cambio:</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-200">
            {siguiente ? null : <AvisoDesactivar />}
            <dl className="space-y-1.5">
              <Fila etiqueta="Facturación" linea={resumen.facturacion} />
              <Fila etiqueta="Registro de jornada" linea={resumen.registroJornada} />
              <Fila etiqueta="Datos de clientes" linea={resumen.retencionClientes} />
            </dl>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setConfirmando(false)} className="min-h-[44px] rounded-lg border border-white/20 px-4 text-sm text-white">
              Cancelar
            </button>
            <button type="button" onClick={() => void guardar()} className="min-h-[44px] rounded-lg bg-amber-500 px-4 text-sm font-semibold text-slate-900">
              {accion}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

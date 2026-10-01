import { Info } from 'lucide-react';
import { RETENCION_CLIENTES_CON_TPV_ANIOS, RETENCION_CLIENTES_SIN_TPV_ANIOS } from '@/lib/empresa/tpv-legal';

/**
 * Qué implica la columna TPV de la tabla de empresas. Lo concreto de cada
 * empresa se muestra en el diálogo de `InterruptorTpv` al cambiarlo.
 */
export function NotaLegal() {
  return (
    <aside aria-label="Cumplimiento legal" className="flex gap-3 rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-slate-300">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
      <p>
        <strong className="text-white">TPV y cumplimiento legal.</strong> El TPV es lo único que emite facturas en este
        sistema. Sin TPV, la web solo confirma pedidos: factura el programa del cliente, no hay registro de jornada y los
        datos de sus clientes se anonimizan a los {RETENCION_CLIENTES_SIN_TPV_ANIOS} años sin actividad (con TPV,{' '}
        {RETENCION_CLIENTES_CON_TPV_ANIOS}). Al cambiar el TPV de una empresa verás cómo queda antes de confirmar.
      </p>
    </aside>
  );
}

'use client';

import { useId, useState } from 'react';
import { PillSwitch } from '@/components/ui/pill-switch';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { resumenLegalEmpresa, type EstadoLegal, type LineaLegal } from '@/lib/empresa/tpv-legal';

export interface EmpresaLegalSuperadmin {
  readonly id: string;
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

function ConfirmarDesactivar({ nombre, onConfirmar, onCancelar }: Readonly<{ nombre: string; onConfirmar: () => void; onCancelar: () => void }>) {
  const tituloId = useId();
  const textoId = useId();
  return (
    <div role="alertdialog" aria-labelledby={tituloId} aria-describedby={textoId} className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 space-y-3">
      <p id={tituloId} className="font-semibold text-amber-200">¿Desactivar el TPV de {nombre}?</p>
      <p id={textoId} className="text-sm text-amber-100/90">
        Sus empleados no podrán fichar ni cobrar, y la facturación pasará a su programa externo. Los fichajes y cobros
        ya registrados se conservan: no se borra nada.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onConfirmar} className="min-h-[44px] rounded-lg bg-amber-500 px-4 text-sm font-semibold text-slate-900">
          Desactivar TPV
        </button>
        <button type="button" onClick={onCancelar} className="min-h-[44px] rounded-lg border border-white/20 px-4 text-sm text-white">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function BloqueEmpresa({ empresa }: Readonly<{ empresa: EmpresaLegalSuperadmin }>) {
  const tituloId = useId();
  const [tpv, setTpv] = useState(empresa.tpvHabilitado);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resumen = resumenLegalEmpresa({ tpvHabilitado: tpv, verifactuMode: empresa.verifactuMode });

  async function guardar(valor: boolean) {
    setConfirmando(false);
    setError(null);
    setTpv(valor);
    setGuardando(true);
    try {
      const res = await fetchWithCsrf(`/api/superadmin/empresas/${empresa.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tpv_habilitado: valor }),
      });
      if (!res.ok) throw new Error('respuesta no válida');
    } catch {
      setTpv(!valor);
      setError('No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  // Apagar el TPV corta el cobro y los fichajes del tenant: se confirma.
  // Encenderlo no tiene consecuencias destructivas: se guarda directamente.
  function alPulsar() {
    if (tpv) setConfirmando(true);
    else void guardar(true);
  }

  return (
    <section aria-labelledby={tituloId} className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h4 id={tituloId} className="font-medium text-white">{empresa.nombre}</h4>
        <div className="flex min-h-[44px] items-center gap-2 text-sm text-slate-300">
          <span aria-hidden="true">TPV</span>
          <PillSwitch checked={tpv} disabled={guardando} onChange={alPulsar} ariaLabel={`TPV de ${empresa.nombre}`} />
        </div>
      </div>
      {confirmando && (
        <ConfirmarDesactivar nombre={empresa.nombre} onConfirmar={() => void guardar(false)} onCancelar={() => setConfirmando(false)} />
      )}
      {error !== null && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <dl className="space-y-1.5 text-sm">
        <Fila etiqueta="Facturación" linea={resumen.facturacion} />
        <Fila etiqueta="Registro de jornada" linea={resumen.registroJornada} />
        <Fila etiqueta="Datos de clientes" linea={resumen.retencionClientes} />
      </dl>
    </section>
  );
}

/**
 * Qué obligaciones legales cubre el sistema para cada tenant. El interruptor
 * de TPV es el único dato editable: el resto se DERIVA de él
 * (`resumenLegalEmpresa`), así nunca puede quedar "fichajes sin TPV".
 */
export function SeccionLegal({ empresas }: Readonly<{ empresas: readonly EmpresaLegalSuperadmin[] }>) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Cumplimiento legal</h3>
        <p className="mt-1 text-sm text-slate-400">
          El TPV es lo único que emite facturas en este sistema. Sin TPV, la web solo confirma pedidos: factura el
          programa del cliente, no hay registro de jornada y los datos de sus clientes se guardan menos tiempo.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {empresas.map((e) => <BloqueEmpresa key={e.id} empresa={e} />)}
      </div>
    </div>
  );
}

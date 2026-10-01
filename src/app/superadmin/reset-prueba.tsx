'use client';

import { useId, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';

interface Props {
  readonly empresaId: string;
  readonly nombre: string;
}

interface Borrados {
  readonly pedidos: number;
  readonly cobros: number;
  readonly turnos: number;
  readonly clientes: number;
}

async function pedirReset(empresaId: string): Promise<Borrados | null> {
  try {
    const res = await fetchWithCsrf(`/api/superadmin/empresas/${empresaId}/reset-prueba`, { method: 'POST' });
    if (!res.ok) return null;
    // `handleResult` responde con los datos SIN envolver (no `{ data }`).
    return (await res.json()) as Borrados;
  } catch {
    return null;
  }
}

/**
 * Botón de reset de una empresa de prueba (`empresas.es_prueba`). Solo se pinta
 * para esas empresas; aun así, la BD rechaza el reset de cualquier otra.
 * Confirmar exige escribir el nombre: el borrado no tiene vuelta atrás.
 */
export function ResetPrueba({ empresaId, nombre }: Props) {
  const inputId = useId();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrados, setBorrados] = useState<Borrados | null>(null);

  function alCambiarApertura(siguiente: boolean) {
    setAbierto(siguiente);
    setTexto('');
  }

  async function confirmar() {
    setBorrando(true);
    setError(null);
    const resultado = await pedirReset(empresaId);
    setBorrando(false);
    alCambiarApertura(false);
    if (resultado === null) {
      setError('No se pudo resetear. Inténtalo de nuevo.');
      return;
    }
    setBorrados(resultado);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => alCambiarApertura(true)}
        className="min-h-[44px] rounded-lg border border-amber-400/50 px-3 text-xs font-medium text-amber-200 hover:bg-amber-500/10"
      >
        Resetear datos de prueba
      </button>
      {error !== null && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {borrados !== null && (
        <p role="status" className="text-xs text-emerald-300">
          Borrados: {borrados.pedidos} pedidos, {borrados.cobros} cobros, {borrados.turnos} turnos y {borrados.clientes} clientes
        </p>
      )}
      <Dialog open={abierto} onOpenChange={alCambiarApertura}>
        <DialogContent role="alertdialog" className="border-white/20 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>¿Resetear los datos de {nombre}?</DialogTitle>
            <DialogDescription className="text-slate-300">
              Es una empresa de prueba. El borrado no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-200">
            <p>Se borran todos sus pedidos, cobros del TPV, turnos de caja y clientes.</p>
            <p>Se conserva todo lo demás: catálogo, fotos, landing, configuración, mesas, empleados y fichajes.</p>
            <label htmlFor={inputId} className="block text-slate-300">
              Escribe el nombre de la empresa para confirmar:
            </label>
            <input
              id={inputId}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
              className="w-full rounded border border-white/20 bg-slate-800 px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <DialogFooter>
            <button type="button" onClick={() => alCambiarApertura(false)} className="min-h-[44px] rounded-lg border border-white/20 px-4 text-sm text-white">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={texto !== nombre || borrando}
              className="min-h-[44px] rounded-lg bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Borrar datos
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

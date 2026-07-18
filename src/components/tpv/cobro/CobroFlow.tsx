'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MetodoPago, TpvCobro } from '@/core/domain/entities/tpv-types';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useOnlineStatus } from '@/hooks/tpv/useOnlineStatus';
import {
  enqueueOfflineCobro,
  getOfflineQueue,
  removeFromQueue,
  type OfflineCobroEntry,
} from '@/lib/tpv/offline-queue';
import { CobroMetodoPropina } from './CobroMetodoPropina';
import { CobroEfectivo } from './CobroEfectivo';
import { CobroTarjeta } from './CobroTarjeta';
import { CobroConfirmado } from './CobroConfirmado';

interface Props {
  readonly sesionId: string;
  readonly turnoId: string;
  readonly totalCents: number;
  readonly yaCobradoCents: number;
  readonly mesaNumero: number;
  readonly operadorNombre: string;
  readonly empresaId: string;
  readonly empresaNombre: string;
  readonly empresaNif: string | null;
  readonly tipoImpuesto: 'iva' | 'igic';
  readonly porcentajeImpuesto: number;
}

type Step = 'metodo' | 'efectivo' | 'tarjeta' | 'confirmado';

async function flushOfflineQueue(): Promise<void> {
  const entries = await getOfflineQueue();
  if (entries.length === 0) return;

  const res = await fetchWithCsrf('/api/tpv/sync-offline', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });

  if (!res.ok) return;

  const { results } = (await res.json()) as { results: { id: string; status: string }[] };
  for (const r of results) {
    if (r.status === 'ok' || r.status === 'revision') {
      await removeFromQueue(r.id);
    }
  }
}

export function CobroFlow({
  sesionId,
  turnoId,
  totalCents,
  yaCobradoCents,
  mesaNumero,
  operadorNombre,
  empresaId,
  empresaNombre,
  empresaNif,
  tipoImpuesto,
  porcentajeImpuesto,
}: Props) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [step, setStep] = useState<Step>('metodo');
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [propinaCents, setPropinaCents] = useState(0);
  const [descuentoCents, setDescuentoCents] = useState(0);
  const [entregadoCents, setEntregadoCents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cobro, setCobro] = useState<TpvCobro | null>(null);
  const [esOffline, setEsOffline] = useState(false);

  const totalPendienteCents = totalCents - yaCobradoCents;
  const [importeParcialCents, setImporteParcialCents] = useState(totalPendienteCents);

  const efectivoPendienteCents = totalPendienteCents - descuentoCents;
  const esParcial = importeParcialCents < efectivoPendienteCents;
  const totalFinalCents = importeParcialCents + propinaCents;

  // Flush queue when connectivity is restored
  useEffect(() => {
    if (!isOnline) return;
    void flushOfflineQueue();
  }, [isOnline]);

  const confirmarOffline = useCallback(
    async (importe: number) => {
      setEntregadoCents(importe);
      setLoading(true);
      const entry: OfflineCobroEntry = {
        id: crypto.randomUUID(),
        sesionId,
        mesaNumero,
        metodoPago: metodo,
        importeCobradoCents: totalFinalCents,
        propinaCents,
        descuentoCents,
        operadorNombre,
        turnoId,
        empresaId,
        ivaPorcentaje: porcentajeImpuesto,
        ts: Date.now(),
      };
      await enqueueOfflineCobro(entry);
      setLoading(false);
      setEsOffline(true);
      setStep('confirmado');
    },
    [
      sesionId, mesaNumero, metodo, totalFinalCents,
      propinaCents, descuentoCents, operadorNombre, turnoId, empresaId, porcentajeImpuesto,
    ],
  );

  const confirmarOnline = useCallback(
    async (importe: number) => {
      setEntregadoCents(importe);
      setLoading(true);

      const res = await fetchWithCsrf('/api/tpv/cobro', {
        method: 'POST',
        body: JSON.stringify({
          sesionId,
          metodoPago: metodo,
          importeCobradoCents: totalFinalCents,
          propinaCents,
          descuentoCents,
          turnoId,
          ivaPorcentaje: porcentajeImpuesto,
          cerrarSesion: !esParcial,
        }),
      });

      setLoading(false);
      if (res.ok) {
        const json = (await res.json()) as TpvCobro;
        setCobro(json);
        setStep('confirmado');
      }
    },
    [sesionId, metodo, totalFinalCents, propinaCents, descuentoCents, turnoId, porcentajeImpuesto, esParcial],
  );

  function confirmarCobro(importe: number) {
    if (isOnline) {
      void confirmarOnline(importe);
    } else {
      void confirmarOffline(importe);
    }
  }

  if (step === 'metodo') {
    return (
      <CobroMetodoPropina
        totalCents={totalCents}
        yaCobradoCents={yaCobradoCents}
        totalPendienteCents={totalPendienteCents}
        importeParcialCents={importeParcialCents}
        metodo={metodo}
        propinaCents={propinaCents}
        descuentoCents={descuentoCents}
        onImporteChange={setImporteParcialCents}
        onMetodoChange={setMetodo}
        onPropinaChange={setPropinaCents}
        onDescuentoChange={setDescuentoCents}
        onContinuar={() => setStep(metodo === 'efectivo' ? 'efectivo' : 'tarjeta')}
        onCancel={() => router.push('/tpv/mostrador')}
      />
    );
  }

  if (step === 'efectivo') {
    return (
      <CobroEfectivo
        totalFinalCents={totalFinalCents}
        loading={loading}
        onConfirmar={confirmarCobro}
        onBack={() => setStep('metodo')}
      />
    );
  }

  if (step === 'tarjeta') {
    return (
      <CobroTarjeta
        totalFinalCents={totalFinalCents}
        propinaCents={propinaCents}
        baseCents={importeParcialCents}
        loading={loading}
        onConfirmar={() => confirmarCobro(totalFinalCents)}
        onBack={() => setStep('metodo')}
      />
    );
  }

  return (
    <CobroConfirmado
      totalFinalCents={totalFinalCents}
      metodo={metodo}
      entregadoCents={entregadoCents}
      propinaCents={propinaCents}
      descuentoCents={descuentoCents}
      mesaNumero={mesaNumero}
      operadorNombre={operadorNombre}
      empresaNombre={empresaNombre}
      empresaNif={empresaNif}
      cobro={cobro}
      tipoImpuesto={tipoImpuesto}
      esParcial={esParcial}
      esOffline={esOffline}
      pendienteCents={efectivoPendienteCents - importeParcialCents}
      onNuevaOperacion={() => { router.refresh(); router.push('/tpv/mostrador'); }}
    />
  );
}

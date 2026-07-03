'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MetodoPago, TpvCobro } from '@/core/domain/entities/tpv-types';
import { getCsrfToken } from '@/lib/csrf-client';
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
  readonly empresaNif: string | null;
  readonly tipoImpuesto: 'iva' | 'igic';
  readonly porcentajeImpuesto: number;
}

type Step = 'metodo' | 'efectivo' | 'tarjeta' | 'confirmado';

export function CobroFlow({ sesionId, turnoId, totalCents, yaCobradoCents, mesaNumero, operadorNombre, empresaNif, tipoImpuesto, porcentajeImpuesto }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('metodo');
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [propinaCents, setPropinaCents] = useState(0);
  const [entregadoCents, setEntregadoCents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cobro, setCobro] = useState<TpvCobro | null>(null);

  const totalPendienteCents = totalCents - yaCobradoCents;
  const [importeParcialCents, setImporteParcialCents] = useState(totalPendienteCents);

  const esParcial = importeParcialCents < totalPendienteCents;
  const totalFinalCents = importeParcialCents + propinaCents;

  async function confirmarCobro(importe: number) {
    setEntregadoCents(importe);
    setLoading(true);

    const csrfToken = getCsrfToken();
    const res = await fetch('/api/tpv/cobro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({
        sesionId,
        metodoPago: metodo,
        importeCobradoCents: totalFinalCents,
        propinaCents,
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
        onImporteChange={setImporteParcialCents}
        onMetodoChange={setMetodo}
        onPropinaChange={setPropinaCents}
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
      mesaNumero={mesaNumero}
      operadorNombre={operadorNombre}
      cobro={cobro}
      empresaNif={empresaNif}
      tipoImpuesto={tipoImpuesto}
      esParcial={esParcial}
      pendienteCents={totalPendienteCents - importeParcialCents}
      onNuevaOperacion={() => { router.refresh(); router.push('/tpv/mostrador'); }}
    />
  );
}

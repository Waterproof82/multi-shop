'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { t } from '@/lib/translations';

type TipoImpuesto = 'iva' | 'igic';

interface ComprasContextValue {
  tipoImpuesto: TipoImpuesto;
}

const ComprasContext = createContext<ComprasContextValue>({ tipoImpuesto: 'iva' });

export function ComprasProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [tipoImpuesto, setTipoImpuesto] = useState<TipoImpuesto>('iva');

  useEffect(() => {
    fetch('/api/admin/empresa')
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data?.tipoImpuesto === 'igic') setTipoImpuesto('igic');
      })
      .catch(() => {
        // keep default 'iva'
      });
  }, []);

  return (
    <ComprasContext.Provider value={{ tipoImpuesto }}>
      {children}
    </ComprasContext.Provider>
  );
}

export function useComprasTipoImpuesto(): TipoImpuesto {
  return useContext(ComprasContext).tipoImpuesto;
}

export const IVA_OPTIONS: ReadonlyArray<{ value: number; labelKey: Parameters<typeof t>[0] }> = [
  { value: 0,  labelKey: 'comprasIvaExento' },
  { value: 4,  labelKey: 'comprasIva4' },
  { value: 10, labelKey: 'comprasIva10' },
  { value: 21, labelKey: 'comprasIva21' },
];

export const IGIC_OPTIONS: ReadonlyArray<{ value: number; labelKey: Parameters<typeof t>[0] }> = [
  { value: 0,   labelKey: 'comprasIvaExento' },
  { value: 3,   labelKey: 'comprasIgic3' },
  { value: 7,   labelKey: 'comprasIgic7' },
  { value: 9.5, labelKey: 'comprasIgic95' },
  { value: 15,  labelKey: 'comprasIgic15' },
];

export function getRateOptions(tipoImpuesto: TipoImpuesto) {
  return tipoImpuesto === 'igic' ? IGIC_OPTIONS : IVA_OPTIONS;
}

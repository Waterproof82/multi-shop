'use client';

import { useId } from 'react';
import type { GarantiaFila } from '@/core/domain/entities/empresa-legal';
import { GARANTIA_NUEVO_MESES, MIN_SEGUNDA_MANO_MESES } from '@/core/domain/legal/constantes';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 min-h-[44px] text-sm text-white';

interface Props {
  filas: GarantiaFila[];
  onChange: (filas: GarantiaFila[]) => void;
}

function conEstado(fila: GarantiaFila, estado: GarantiaFila['estado']): GarantiaFila {
  if (estado === 'nuevo') return { ...fila, estado, mesesLegales: GARANTIA_NUEVO_MESES };
  return { ...fila, estado, mesesLegales: Math.max(fila.mesesLegales, MIN_SEGUNDA_MANO_MESES) };
}

function FilaGarantia({ fila, onChange, onQuitar }: Readonly<{ fila: GarantiaFila; onChange: (f: GarantiaFila) => void; onQuitar: () => void }>) {
  const { language } = useLanguage();
  const id = useId();
  return (
    <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-white/10 p-3">
      <div>
        <label htmlFor={`${id}-ambito`} className="text-xs text-slate-400">{t('legalGarantiaAmbito', language)}</label>
        <input id={`${id}-ambito`} className={inputClass} maxLength={120} value={fila.ambito}
          onChange={(e) => onChange({ ...fila, ambito: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`${id}-estado`} className="text-xs text-slate-400">{t('legalGarantiaEstado', language)}</label>
        <select id={`${id}-estado`} className={inputClass} value={fila.estado}
          onChange={(e) => onChange(conEstado(fila, e.target.value === 'segunda_mano' ? 'segunda_mano' : 'nuevo'))}>
          <option value="nuevo">{t('legalGarantiaNuevo', language)}</option>
          <option value="segunda_mano">{t('legalGarantiaSegundaMano', language)}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-legal`} className="text-xs text-slate-400">{t('legalGarantiaMesesLegales', language)}</label>
        <input id={`${id}-legal`} type="number" className={inputClass} min={MIN_SEGUNDA_MANO_MESES} max={120}
          value={fila.mesesLegales} disabled={fila.estado === 'nuevo'}
          onChange={(e) => onChange({ ...fila, mesesLegales: Number(e.target.value) })} />
      </div>
      <div>
        <label htmlFor={`${id}-extra`} className="text-xs text-slate-400">{t('legalGarantiaMesesExtra', language)}</label>
        <input id={`${id}-extra`} type="number" className={inputClass} min={0} max={240} value={fila.mesesComercialesExtra}
          onChange={(e) => onChange({ ...fila, mesesComercialesExtra: Number(e.target.value) })} />
      </div>
      <button type="button" onClick={onQuitar} className="sm:col-span-2 min-h-[44px] text-sm text-red-300 hover:text-red-200 text-left">
        {t('legalGarantiaQuitar', language)}
      </button>
    </fieldset>
  );
}

export function GarantiasEditor({ filas, onChange }: Readonly<Props>) {
  const { language } = useLanguage();
  const actualizar = (i: number, f: GarantiaFila) => onChange(filas.map((x, j) => (j === i ? f : x)));
  const quitar = (i: number) => onChange(filas.filter((_, j) => j !== i));
  const anadir = () =>
    onChange([...filas, { ambito: '', estado: 'nuevo', mesesLegales: GARANTIA_NUEVO_MESES, mesesComercialesExtra: 0 }]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">{t('legalGarantiasAyuda', language)}</p>
      {filas.map((fila, i) => (
        // Las filas no tienen id propio y se pueden reordenar solo quitando; el índice es estable aquí.
        <FilaGarantia key={i} fila={fila} onChange={(f) => actualizar(i, f)} onQuitar={() => quitar(i)} />
      ))}
      {filas.length < 20 && (
        <button type="button" onClick={anadir} className="min-h-[44px] rounded-md border border-white/10 px-3 text-sm text-white hover:bg-white/10">
          {t('legalGarantiaAnadir', language)}
        </button>
      )}
    </div>
  );
}

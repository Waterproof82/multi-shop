'use client';

// sdd pet-id-qr-profile, Fase 7 (admin UI, PR7) — recuento del lote
// (R-QR.1.2, nunca PII) y generación de códigos (R-QR.1.1), sobre
// `GET`/`POST /api/admin/mascotas/lotes/{id}/chapas` (PR5b). Calco de
// `series-lote.tsx` del módulo de kits, sin el bloque de etiquetas PDF (eso
// es la Fase 8).

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import type { RecuentoPorEstado } from '@/core/domain/entities/pet-chapa-types';

const CANTIDAD_MINIMA = 1;
const CANTIDAD_MAXIMA = 500;

/** R-QR.1.1: mismo rango 1-500 que `generarCodigosChapaSchema` en Zod — backstop del 400, no el único guardián. */
export function cantidadCodigosChapaValida(cantidad: number): boolean {
  return Number.isInteger(cantidad) && cantidad >= CANTIDAD_MINIMA && cantidad <= CANTIDAD_MAXIMA;
}

function withEmpresaId(url: string, overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}empresaId=${id}`;
}

interface LoteChapasPanelProps {
  loteId: string;
}

export function LoteChapasPanel({ loteId }: Readonly<LoteChapasPanelProps>) {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [recuento, setRecuento] = useState<RecuentoPorEstado | null>(null);
  const [cantidad, setCantidad] = useState(50);
  const [codigosGenerados, setCodigosGenerados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(withEmpresaId(`/api/admin/mascotas/lotes/${loteId}/chapas`, overrideEmpresaId, empresaId));
      if (!res.ok) throw new Error(t('mascotasErrorCargarRecuento', language));
      setRecuento(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [loteId, empresaId, overrideEmpresaId, language]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleGenerar = async () => {
    if (!cantidadCodigosChapaValida(cantidad)) return;
    setGenerating(true);
    setError('');
    setCodigosGenerados([]);
    try {
      const res = await fetchWithCsrf(withEmpresaId(`/api/admin/mascotas/lotes/${loteId}/chapas`, overrideEmpresaId, empresaId), {
        method: 'POST',
        body: JSON.stringify({ cantidad }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('mascotasErrorGenerarCodigos', language));
      }
      setCodigosGenerados(await res.json());
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">{t('mascotasRecuentoTitle', language)}</h2>
      </div>

      {error && (
        <div className="m-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        recuento && (
          <div className="p-4 grid grid-cols-3 gap-3 border-b border-white/10 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{recuento.libre}</p>
              <p className="text-xs text-slate-400 uppercase">{t('mascotasRecuentoLibre', language)}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{recuento.pendiente}</p>
              <p className="text-xs text-slate-400 uppercase">{t('mascotasRecuentoPendiente', language)}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{recuento.activa}</p>
              <p className="text-xs text-slate-400 uppercase">{t('mascotasRecuentoActiva', language)}</p>
            </div>
          </div>
        )
      )}

      <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-end border-b border-white/10">
        <div>
          <label htmlFor="mascotas-chapas-cantidad" className="block text-sm font-medium text-slate-300 mb-1">{t('mascotasCantidadCodigos', language)}</label>
          <Input
            id="mascotas-chapas-cantidad"
            type="number"
            min={CANTIDAD_MINIMA}
            max={CANTIDAD_MAXIMA}
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className="w-32"
          />
        </div>
        <Button type="button" onClick={handleGenerar} disabled={generating || !cantidadCodigosChapaValida(cantidad)}>
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('mascotasGenerandoCodigos', language)}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              {t('mascotasGenerarCodigos', language)}
            </>
          )}
        </Button>
      </div>

      {codigosGenerados.length > 0 && (
        <div className="p-4">
          <p className="text-sm font-medium text-slate-300 mb-2">{t('mascotasCodigosGenerados', language)}</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-sm text-slate-200">
            {codigosGenerados.map((codigo) => <li key={codigo}>{codigo}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

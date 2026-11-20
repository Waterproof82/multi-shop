'use client';

// sdd pet-id-qr-profile, Fase 7 (admin UI, PR7) — recuento del lote
// (R-QR.1.2, nunca PII) y generación de códigos (R-QR.1.1), sobre
// `GET`/`POST /api/admin/mascotas/lotes/{id}/chapas` (PR5b). Calco de
// `series-lote.tsx` del módulo de kits.
//
// Fase 8 (PR8, R-QR.14) añade los botones de descarga de etiquetas PDF por
// bloque de `POR_PDF` (500) chapas y del CSV del lote completo: `fetch` →
// `Blob` → `URL.createObjectURL` (igual que `handleDescargarEtiquetas` de
// `series-lote.tsx`), nunca un `<a download>` directo a la ruta, para poder
// mostrar el error de la API en vez de "descargar" su JSON.

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles, Download, FileSpreadsheet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import { PET_PERFIL_PUBLICO_LIVE } from '@/lib/pet-id/publico';
import type { RecuentoPorEstado } from '@/core/domain/entities/pet-chapa-types';

const CANTIDAD_MINIMA = 1;
const CANTIDAD_MAXIMA = 500;
const BLOQUE_ETIQUETAS = 500;

/** R-QR.1.1: mismo rango 1-500 que `generarCodigosChapaSchema` en Zod — backstop del 400, no el único guardián. */
export function cantidadCodigosChapaValida(cantidad: number): boolean {
  return Number.isInteger(cantidad) && cantidad >= CANTIDAD_MINIMA && cantidad <= CANTIDAD_MAXIMA;
}

/** Fase 8/R-QR.14.1: un botón por bloque de 500 chapas (normalmente uno); al menos 1 aunque no haya chapas (desactivado). */
export function bloquesEtiquetasChapa(totalCodigos: number): number {
  return Math.max(1, Math.ceil(totalCodigos / BLOQUE_ETIQUETAS));
}

function rangoBloque(pagina: number, totalCodigos: number): { inicio: number; fin: number } {
  const inicio = (pagina - 1) * BLOQUE_ETIQUETAS + 1;
  const fin = Math.min(pagina * BLOQUE_ETIQUETAS, totalCodigos);
  return { inicio, fin };
}

function nombreDeDisposition(disposition: string, respaldo: string): string {
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? respaldo;
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
  const [descargandoEtiquetas, setDescargandoEtiquetas] = useState<number | null>(null);
  const [descargandoCsv, setDescargandoCsv] = useState(false);

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

  /** R-QR.14.1: `fetch` → `Blob` → `URL.createObjectURL`, nunca un `<a download>` directo — un error de la API (403/400) nunca se "descarga" como PDF. */
  const handleDescargarEtiquetas = async (pagina: number) => {
    setDescargandoEtiquetas(pagina);
    setError('');
    try {
      const res = await fetch(withEmpresaId(`/api/admin/mascotas/lotes/${loteId}/etiquetas?pagina=${pagina}`, overrideEmpresaId, empresaId));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('mascotasErrorEtiquetas', language));
      }
      const blob = await res.blob();
      const nombre = nombreDeDisposition(res.headers.get('Content-Disposition') ?? '', `etiquetas-${pagina}.pdf`);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mascotasErrorEtiquetas', language));
    } finally {
      setDescargandoEtiquetas(null);
    }
  };

  /** R-QR.14.3: mismo patrón que `handleDescargarEtiquetas`, sin paginar (el lote completo). */
  const handleDescargarCsv = async () => {
    setDescargandoCsv(true);
    setError('');
    try {
      const res = await fetch(withEmpresaId(`/api/admin/mascotas/lotes/${loteId}/csv`, overrideEmpresaId, empresaId));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('mascotasErrorCsv', language));
      }
      const blob = await res.blob();
      const nombre = nombreDeDisposition(res.headers.get('Content-Disposition') ?? '', 'chapas.csv');
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mascotasErrorCsv', language));
    } finally {
      setDescargandoCsv(false);
    }
  };

  const totalCodigos = recuento ? recuento.libre + recuento.pendiente + recuento.activa : 0;
  const bloques = bloquesEtiquetasChapa(totalCodigos);

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

      <div className="p-4 flex flex-col gap-3 border-t border-white/10">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: bloques }, (_, i) => i + 1).map((pagina) => {
            const { inicio, fin } = rangoBloque(pagina, totalCodigos);
            const etiquetaRango = bloques > 1 ? ` (${inicio}–${fin})` : '';
            return (
              <Button
                key={pagina}
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => handleDescargarEtiquetas(pagina)}
                disabled={totalCodigos === 0 || descargandoEtiquetas !== null || descargandoCsv}
              >
                {descargandoEtiquetas === pagina ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t('mascotasDescargandoEtiquetas', language)}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    {t('mascotasDescargarEtiquetas', language)}{etiquetaRango}
                  </>
                )}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={handleDescargarCsv}
            disabled={totalCodigos === 0 || descargandoEtiquetas !== null || descargandoCsv}
          >
            {descargandoCsv ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('mascotasDescargandoCsv', language)}
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {t('mascotasDescargarCsv', language)}
              </>
            )}
          </Button>
        </div>
        {!PET_PERFIL_PUBLICO_LIVE && (
          <p className="text-xs text-amber-300">{t('mascotasEtiquetasMuestraAviso', language)}</p>
        )}
      </div>
    </div>
  );
}

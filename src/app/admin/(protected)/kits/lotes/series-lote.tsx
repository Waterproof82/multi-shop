'use client';

// kit-expiry-reminders M4c — generación y listado de series de un lote
// (docs/sdd/kit-expiry-reminders/m4/, R-M4.4, DD10 de design.md), montada
// debajo del editor de caducidades de M4b2b en la página del lote.
//
// M5c (docs/sdd/kit-expiry-reminders/m5/, R-M5.5) añade el botón de
// descarga de etiquetas PDF por bloque de 500 series: `fetch` → `Blob` →
// `URL.createObjectURL` (DD8), nunca un `<a download>` directo a la ruta,
// para poder mostrar el error de la API en vez de "descargar" su JSON.

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import { KIT_ESTADO_PUBLICO_LIVE } from '@/lib/kit-caducidad/publico';
import type { KitSerie } from '@/core/domain/entities/kit-caducidad-types';

const CANTIDAD_MINIMA = 1;
const CANTIDAD_MAXIMA = 500;
const BLOQUE_ETIQUETAS = 500;

/** R-M4.4.1/DD10: mismo rango 1-500 que `generarSeriesSchema` en Zod — backstop del 400, no el único guardián. */
export function cantidadValida(cantidad: number): boolean {
  return Number.isInteger(cantidad) && cantidad >= CANTIDAD_MINIMA && cantidad <= CANTIDAD_MAXIMA;
}

/** R-M5.5.1: un botón por bloque de 500 series (normalmente uno); al menos 1 aunque no haya series (desactivado). */
export function bloquesEtiquetas(totalSeries: number): number {
  return Math.max(1, Math.ceil(totalSeries / BLOQUE_ETIQUETAS));
}

function rangoBloque(pagina: number, totalSeries: number): { inicio: number; fin: number } {
  const inicio = (pagina - 1) * BLOQUE_ETIQUETAS + 1;
  const fin = Math.min(pagina * BLOQUE_ETIQUETAS, totalSeries);
  return { inicio, fin };
}

/** DD10: nombre de fichero de respaldo si la respuesta no trae `Content-Disposition` legible. */
function nombreEtiquetasRespaldo(pagina: number): string {
  return `etiquetas-${pagina}.pdf`;
}

function nombreDeDisposition(disposition: string, pagina: number): string {
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? nombreEtiquetasRespaldo(pagina);
}

function withEmpresaId(url: string, overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}empresaId=${id}`;
}

interface SeriesLoteProps {
  loteId: string;
}

export function SeriesLote({ loteId }: Readonly<SeriesLoteProps>) {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [series, setSeries] = useState<KitSerie[]>([]);
  const [cantidad, setCantidad] = useState(50);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [descargando, setDescargando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(withEmpresaId(`/api/admin/kits/lotes/${loteId}/series`, overrideEmpresaId, empresaId));
      if (!res.ok) throw new Error(t('kitsErrorCargarSeries', language));
      setSeries(await res.json());
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
    if (!cantidadValida(cantidad)) return;
    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetchWithCsrf(withEmpresaId(`/api/admin/kits/lotes/${loteId}/series`, overrideEmpresaId, empresaId), {
        method: 'POST',
        body: JSON.stringify({ cantidad }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('kitsErrorGenerarSeries', language));
      }
      setSuccess(t('kitsSeriesGeneradas', language));
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerating(false);
    }
  };

  /** R-M5.5/DD8: `fetch` → `Blob` → `URL.createObjectURL`, nunca un `<a download>` directo — un error de la API (403/400) nunca se "descarga" como PDF. */
  const handleDescargarEtiquetas = async (pagina: number) => {
    setDescargando(pagina);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(withEmpresaId(`/api/admin/kits/lotes/${loteId}/etiquetas?pagina=${pagina}`, overrideEmpresaId, empresaId));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('kitsErrorEtiquetas', language));
      }
      const blob = await res.blob();
      const nombre = nombreDeDisposition(res.headers.get('Content-Disposition') ?? '', pagina);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('kitsErrorEtiquetas', language));
    } finally {
      setDescargando(null);
    }
  };

  const bloques = bloquesEtiquetas(series.length);

  return (
    <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">{t('kitsSeriesTitle', language)}</h2>
      </div>

      {error && (
        <div className="m-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{error}</div>
      )}
      {success && (
        <div className="m-4 p-3 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-md">{success}</div>
      )}

      <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-end border-b border-white/10">
        <div>
          <label htmlFor="kit-series-cantidad" className="block text-sm font-medium text-slate-300 mb-1">{t('kitsCantidadSeries', language)}</label>
          <Input
            id="kit-series-cantidad"
            type="number"
            min={CANTIDAD_MINIMA}
            max={CANTIDAD_MAXIMA}
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className="w-32"
          />
        </div>
        <Button type="button" onClick={handleGenerar} disabled={generating || !cantidadValida(cantidad)}>
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('kitsGenerandoSeries', language)}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              {t('kitsGenerarSeries', language)}
            </>
          )}
        </Button>
      </div>

      <div className="p-4 flex flex-col gap-3 border-b border-white/10">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: bloques }, (_, i) => i + 1).map((pagina) => {
            const { inicio, fin } = rangoBloque(pagina, series.length);
            const etiquetaRango = bloques > 1 ? ` (${inicio}–${fin})` : '';
            return (
              <Button
                key={pagina}
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => handleDescargarEtiquetas(pagina)}
                disabled={series.length === 0 || descargando !== null}
              >
                {descargando === pagina ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t('kitsDescargandoEtiquetas', language)}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    {t('kitsDescargarEtiquetas', language)}{etiquetaRango}
                  </>
                )}
              </Button>
            );
          })}
        </div>
        {!KIT_ESTADO_PUBLICO_LIVE && (
          <p className="text-xs text-amber-300">{t('kitsEtiquetasMuestraAviso', language)}</p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsSerie', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsSerieRegistrada', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {series.map((s) => (
                <tr key={s.serie} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-mono">{s.serie}</td>
                  <td className="px-4 py-3 text-slate-200">
                    {s.registradoAt ? t('kitsSerieRegistrada', language) : t('kitsSerieSinRegistrar', language)}
                  </td>
                </tr>
              ))}
              {series.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-slate-400">{t('kitsSinSeries', language)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

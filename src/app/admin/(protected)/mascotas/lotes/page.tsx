'use client';

// sdd pet-id-qr-profile, Fase 7 (admin UI, PR7) — alta y listado de lotes de
// chapas QR, calco de `kits/lotes/page.tsx` (M4b2). El selector de producto
// reutiliza el listado genérico `/api/admin/productos` (no hace falta un
// endpoint propio: cualquier producto activo de la empresa vale, el trigger
// `pet_chapa_lotes_validar_producto()` ya comprueba que sea de esta empresa).

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Boxes } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import type { PetChapaLote, Paginado } from '@/core/domain/entities/pet-chapa-types';
import { LoteChapasPanel } from './lote-chapas-panel';
import { BorrarDatosChapa } from './borrar-datos-chapa';

interface ProductoAdmin {
  id: string;
  titulo_es: string;
}

/** R-QR.1.1: hace falta un producto y un código de lote no vacío. */
export function loteChapaFormValido(productoId: string, codigo: string): boolean {
  return productoId.trim().length > 0 && codigo.trim().length > 0;
}

function withEmpresaId(url: string, overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}empresaId=${id}`;
}

export default function MascotasLotesPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [lotes, setLotes] = useState<PetChapaLote[]>([]);
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [productoId, setProductoId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loteAbiertoId, setLoteAbiertoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lotesRes, productosRes] = await Promise.all([
        fetch(withEmpresaId('/api/admin/mascotas/lotes', overrideEmpresaId, empresaId)),
        fetch(withEmpresaId('/api/admin/productos', overrideEmpresaId, empresaId)),
      ]);
      if (!lotesRes.ok) throw new Error(t('mascotasErrorCargarLotes', language));
      if (!productosRes.ok) throw new Error(t('mascotasErrorCargarProductos', language));
      const lotesData: Paginado<PetChapaLote> = await lotesRes.json();
      const productosData: ProductoAdmin[] = await productosRes.json();
      setLotes(lotesData.items);
      setProductos(productosData.filter((p) => p.titulo_es));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [empresaId, overrideEmpresaId, language]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleCrearLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteChapaFormValido(productoId, codigo)) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetchWithCsrf(withEmpresaId('/api/admin/mascotas/lotes', overrideEmpresaId, empresaId), {
        method: 'POST',
        body: JSON.stringify({ productoId, codigo: codigo.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('mascotasErrorCrearLote', language));
      }
      const nuevoLote: PetChapaLote = await res.json();
      setCodigo('');
      setLotes((prev) => [nuevoLote, ...prev]);
      setLoteAbiertoId(nuevoLote.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t('mascotasLotesTitle', language)}</h1>
        <p className="text-slate-300 text-sm mt-1">{t('mascotasLotesSubtitle', language)}</p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{error}</div>
      )}

      <form onSubmit={handleCrearLote} className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="mascotas-lote-producto" className="block text-sm font-medium text-slate-300 mb-1">{t('mascotasProducto', language)}</label>
          <select
            id="mascotas-lote-producto"
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm"
            aria-label={t('mascotasSeleccionarProducto', language)}
          >
            <option value="">— {t('mascotasSeleccionarProducto', language)} —</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.titulo_es}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mascotas-lote-codigo" className="block text-sm font-medium text-slate-300 mb-1">{t('mascotasCodigoLote', language)}</label>
          <Input id="mascotas-lote-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={64} />
        </div>
        <div className="sm:col-span-3 flex justify-end">
          <Button type="submit" disabled={creating || !loteChapaFormValido(productoId, codigo)}>
            <Plus className="h-4 w-4" />
            {t('mascotasNuevoLote', language)}
          </Button>
        </div>
      </form>

      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('mascotasCodigoLote', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('mascotasProducto', language)}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('actions', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {lotes.map((lote) => (
                <tr key={lote.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-slate-200">{lote.codigo}</td>
                  <td className="px-4 py-3 text-slate-200">{lote.productoNombre ?? lote.productoId}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLoteAbiertoId(loteAbiertoId === lote.id ? null : lote.id)}
                    >
                      <Boxes className="h-4 w-4" />
                      {t('mascotasVerChapas', language)}
                    </Button>
                  </td>
                </tr>
              ))}
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-400">{t('mascotasSinLotes', language)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loteAbiertoId && <LoteChapasPanel loteId={loteAbiertoId} />}

      <BorrarDatosChapa />
    </div>
  );
}

'use client';

// kit-expiry-reminders M4b2a — listado + alta de lotes de kit (R-M4.2.*).
// El editor de caducidades por lote (R-M4.3.*) se monta aquí en M4b2b
// (`lote-caducidades-editor.tsx`, apilada sobre esta rama): esta PR ya roza
// el presupuesto de 400 líneas solo con el listado/alta + la paridad de
// traducciones de 5 idiomas, así que se trocea igual que M4a2/M4a2b.

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import type { KitLote, Paginado, ProductoKit } from '@/core/domain/entities/kit-caducidad-types';

function withEmpresaId(url: string, overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}empresaId=${id}`;
}

export default function KitsLotesPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [lotes, setLotes] = useState<KitLote[]>([]);
  const [productos, setProductos] = useState<ProductoKit[]>([]);
  const [productoId, setProductoId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [fechaMontaje, setFechaMontaje] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lotesRes, productosRes] = await Promise.all([
        fetch(withEmpresaId('/api/admin/kits/lotes', overrideEmpresaId, empresaId)),
        fetch(withEmpresaId('/api/admin/kits/productos', overrideEmpresaId, empresaId)),
      ]);
      if (!lotesRes.ok) throw new Error(t('kitsErrorCargarLotes', language));
      if (!productosRes.ok) throw new Error(t('kitsErrorCargarProductos', language));
      const lotesData: Paginado<KitLote> = await lotesRes.json();
      const productosData: ProductoKit[] = await productosRes.json();
      setLotes(lotesData.items);
      setProductos(productosData);
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
    if (!productoId || !codigo.trim() || !fechaMontaje) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetchWithCsrf(withEmpresaId('/api/admin/kits/lotes', overrideEmpresaId, empresaId), {
        method: 'POST',
        body: JSON.stringify({ productoId, codigo: codigo.trim(), fechaMontaje }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('kitsErrorCrearLote', language));
      }
      const nuevoLote: KitLote = await res.json();
      setCodigo('');
      setFechaMontaje('');
      setLotes((prev) => [nuevoLote, ...prev]);
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
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t('kitsLotesTitle', language)}</h1>
        <p className="text-slate-300 text-sm mt-1">{t('kitsLotesSubtitle', language)}</p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{error}</div>
      )}

      <form onSubmit={handleCrearLote} className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="kit-lote-producto" className="block text-sm font-medium text-slate-300 mb-1">{t('kitsProducto', language)}</label>
          <select
            id="kit-lote-producto"
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm"
            aria-label={t('kitsSeleccionarProducto', language)}
          >
            <option value="">— {t('kitsSeleccionarProducto', language)} —</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="kit-lote-codigo" className="block text-sm font-medium text-slate-300 mb-1">{t('kitsCodigoLote', language)}</label>
          <Input id="kit-lote-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={64} />
        </div>
        <div>
          <label htmlFor="kit-lote-fecha" className="block text-sm font-medium text-slate-300 mb-1">{t('kitsFechaMontaje', language)}</label>
          <Input id="kit-lote-fecha" type="date" value={fechaMontaje} onChange={(e) => setFechaMontaje(e.target.value)} />
        </div>
        <div className="sm:col-span-4 flex justify-end">
          <Button type="submit" disabled={creating || !productoId || !codigo.trim() || !fechaMontaje}>
            <Plus className="h-4 w-4" />
            {t('kitsNuevoLote', language)}
          </Button>
        </div>
      </form>

      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsCodigoLote', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsProducto', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsFechaMontaje', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {lotes.map((lote) => (
                <tr key={lote.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-slate-200">{lote.codigo}</td>
                  <td className="px-4 py-3 text-slate-200">{lote.productoNombre ?? lote.productoId}</td>
                  <td className="px-4 py-3 text-slate-200">{lote.fechaMontaje}</td>
                </tr>
              ))}
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-400">{t('kitsSinLotes', language)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import type { Ingrediente } from '@/core/domain/entities/stock-types';

interface ProductoOption {
  id: string;
  titulo_es: string;
}

interface RecetaRow {
  ingredienteId: string;
  cantidadNecesaria: number;
}

function buildProductosUrl(overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (id) return `/api/admin/productos?empresaId=${id}`;
  return '/api/admin/productos';
}

function findIngredienteNombre(ingredientes: Ingrediente[], id: string): string {
  return ingredientes.find((i) => i.id === id)?.nombre ?? id;
}

export default function RecetasPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [productos, setProductos] = useState<ProductoOption[]>([]);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [selectedProductoId, setSelectedProductoId] = useState('');
  const [rows, setRows] = useState<RecetaRow[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingReceta, setLoadingReceta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchInit = useCallback(async () => {
    try {
      const productosUrl = buildProductosUrl(overrideEmpresaId, empresaId);
      const [prodRes, ingRes] = await Promise.all([
        fetch(productosUrl),
        fetch('/api/admin/stock/ingredientes'),
      ]);
      if (!prodRes.ok) throw new Error('Error al cargar productos');
      if (!ingRes.ok) throw new Error('Error al cargar ingredientes');
      const prodData = await prodRes.json();
      const ingData = await ingRes.json();
      setProductos(prodData);
      setIngredientes(ingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoadingInit(false);
    }
  }, [empresaId, overrideEmpresaId]);

  useEffect(() => {
    fetchInit();
  }, [fetchInit]);

  const fetchReceta = useCallback(async (productoId: string) => {
    if (!productoId) return;
    setLoadingReceta(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/stock/recetas/${productoId}`);
      if (!res.ok) throw new Error('Error al cargar receta');
      const data: Array<{ ingredienteId: string; cantidadNecesaria: number }> = await res.json();
      setRows(data.map((item) => ({ ingredienteId: item.ingredienteId, cantidadNecesaria: item.cantidadNecesaria })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoadingReceta(false);
    }
  }, []);

  const handleProductoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedProductoId(id);
    setSuccess('');
    setError('');
    setRows([]);
    if (id) fetchReceta(id);
  };

  const handleAddRow = () => {
    const firstAvailable = ingredientes.find(
      (ing) => !rows.some((r) => r.ingredienteId === ing.id)
    );
    if (!firstAvailable) return;
    setRows([...rows, { ingredienteId: firstAvailable.id, cantidadNecesaria: 1 }]);
  };

  const handleRowIngredienteChange = (index: number, ingredienteId: string) => {
    const updated = rows.map((row, i) =>
      i === index ? { ...row, ingredienteId } : row
    );
    setRows(updated);
  };

  const handleRowCantidadChange = (index: number, cantidad: number) => {
    const updated = rows.map((row, i) =>
      i === index ? { ...row, cantidadNecesaria: cantidad } : row
    );
    setRows(updated);
  };

  const handleDeleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedProductoId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetchWithCsrf(`/api/admin/stock/recetas/${selectedProductoId}`, {
        method: 'PUT',
        body: JSON.stringify({ items: rows }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar receta');
      }
      setSuccess('Receta guardada correctamente');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const availableIngredientes = ingredientes.filter(
    (ing) => !rows.some((r, idx) => r.ingredienteId === ing.id && rows.indexOf(r) !== idx)
  );

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {t('stockRecetasTitle', language)}
        </h1>
        <p className="text-slate-300 text-sm mt-1">
          {t('stockRecetasSubtitle', language)}
        </p>
      </div>

      {/* Product selector */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl space-y-4">
        <label htmlFor="producto-select" className="block text-sm font-medium text-slate-300">
          {t('stockSeleccionarProducto', language)}
        </label>
        <select
          id="producto-select"
          value={selectedProductoId}
          onChange={handleProductoChange}
          className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-colors cursor-pointer"
          aria-label={t('stockSeleccionarProducto', language)}
        >
          <option value="">— {t('stockSeleccionarProducto', language)} —</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>{p.titulo_es}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-md">
          {success}
        </div>
      )}

      {/* Recipe editor */}
      {selectedProductoId && (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          {loadingReceta ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        {t('stockIngredienteNombre', language)}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        {t('stockCantidadNecesaria', language)}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                        {t('actions', language)}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rows.map((row, index) => (
                      <tr key={row.ingredienteId} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <select
                            value={row.ingredienteId}
                            onChange={(e) => handleRowIngredienteChange(index, e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-colors cursor-pointer text-sm"
                            aria-label={`Ingrediente fila ${index + 1}`}
                          >
                            <option value={row.ingredienteId}>
                              {findIngredienteNombre(ingredientes, row.ingredienteId)}
                            </option>
                            {availableIngredientes
                              .filter((ing) => ing.id !== row.ingredienteId)
                              .map((ing) => (
                                <option key={ing.id} value={ing.id}>{ing.nombre}</option>
                              ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            min={0.001}
                            step={0.001}
                            value={row.cantidadNecesaria}
                            onChange={(e) => handleRowCantidadChange(index, Number(e.target.value))}
                            aria-label={`Cantidad necesaria fila ${index + 1}`}
                            className="w-32"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(index)}
                            aria-label={`Eliminar fila ${index + 1}`}
                            className="p-2 text-red-400 hover:text-red-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                          {t('stockSinReceta', language)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddRow}
                  disabled={availableIngredientes.length === 0}
                >
                  <Plus className="h-4 w-4" />
                  {t('stockAnadirIngrediente', language)}
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('savingProgress', language)}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {t('stockGuardarReceta', language)}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

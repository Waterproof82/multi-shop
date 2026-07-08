'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { Ingrediente, UnidadMedida } from '@/core/domain/entities/stock-types';

interface IngredienteFormData {
  nombre: string;
  unidad: UnidadMedida;
  cantidadActual: number;
  umbralAlerta: number;
}

const emptyForm: IngredienteFormData = {
  nombre: '',
  unidad: 'kg',
  cantidadActual: 0,
  umbralAlerta: 0,
};

const UNIDADES: UnidadMedida[] = ['kg', 'l', 'ud'];

function isLowStock(ingrediente: Ingrediente): boolean {
  return ingrediente.cantidadActual <= ingrediente.umbralAlerta;
}

function StockBadge({ ingrediente }: Readonly<{ ingrediente: Ingrediente }>) {
  if (isLowStock(ingrediente)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-400/30 text-red-300 text-xs font-medium">
        <AlertTriangle className="w-3 h-3" />
        {ingrediente.cantidadActual} {ingrediente.unidad}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-medium">
      <CheckCircle className="w-3 h-3" />
      {ingrediente.cantidadActual} {ingrediente.unidad}
    </span>
  );
}

export default function IngredientesPage() {
  const { language } = useLanguage();
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<IngredienteFormData>(emptyForm);
  const [error, setError] = useState('');

  const fetchIngredientes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stock/ingredientes');
      if (!res.ok) throw new Error('Error al cargar ingredientes');
      const data = await res.json();
      setIngredientes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIngredientes();
  }, [fetchIngredientes]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const url = editingId
        ? `/api/admin/stock/ingredientes/${editingId}`
        : '/api/admin/stock/ingredientes';
      const method = editingId ? 'PUT' : 'POST';

      const body = editingId
        ? { nombre: formData.nombre, unidad: formData.unidad, umbralAlerta: formData.umbralAlerta }
        : formData;

      const res = await fetchWithCsrf(url, {
        method,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }

      await fetchIngredientes();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return;

    try {
      const res = await fetchWithCsrf(`/api/admin/stock/ingredientes/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Error al eliminar');
      await fetchIngredientes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const openEditModal = (ing: Ingrediente) => {
    setFormData({
      nombre: ing.nombre,
      unidad: ing.unidad,
      cantidadActual: ing.cantidadActual,
      umbralAlerta: ing.umbralAlerta,
    });
    setEditingId(ing.id);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(emptyForm);
    setEditingId(null);
    setError('');
  };

  const alertCount = ingredientes.filter(isLowStock).length;
  const okCount = ingredientes.length - alertCount;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {t('stockIngredientesTitle', language)}
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              {t('stockIngredientesSubtitle', language)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <section className="backdrop-blur-xl bg-gradient-to-br from-red-500/20 to-red-700/20 border border-red-400/30 rounded-xl px-3 sm:px-4 py-3 text-center">
              <AlertTriangle className="w-5 h-5 text-red-300 mx-auto mb-2" />
              <span className="text-lg sm:text-2xl font-semibold text-white">{alertCount}</span>
              <p className="text-slate-300 text-[10px] sm:text-xs">{t('stockIngredienteEnAlerta', language)}</p>
            </section>
            <section className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/20 border border-emerald-400/30 rounded-xl px-3 sm:px-4 py-3 text-center">
              <CheckCircle className="w-5 h-5 text-emerald-300 mx-auto mb-2" />
              <span className="text-lg sm:text-2xl font-semibold text-white">{okCount}</span>
              <p className="text-slate-300 text-[10px] sm:text-xs">{t('stockIngredienteOk', language)}</p>
            </section>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4" />
          <span>{t('stockIngredienteNuevo', language)}</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t('stockIngredienteNombre', language)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t('stockIngredienteUnidad', language)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t('stockIngredienteCantidad', language)}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  {t('stockIngredienteUmbral', language)}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                  {t('actions', language)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {ingredientes.map((ing) => (
                <tr
                  key={ing.id}
                  className={`hover:bg-white/5 transition-colors border-b border-white/10 ${isLowStock(ing) ? 'bg-red-500/5' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-white">{ing.nombre}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{ing.unidad}</td>
                  <td className="px-4 py-3 text-sm">
                    <StockBadge ingrediente={ing} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {ing.umbralAlerta} {ing.unidad}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <button
                      type="button"
                      onClick={() => openEditModal(ing)}
                      aria-label={`${t('edit', language)} ${ing.nombre}`}
                      className="p-2 text-cyan-400 hover:text-cyan-300 mr-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(ing.id, ing.nombre)}
                      aria-label={`${t('delete', language)} ${ing.nombre}`}
                      className="p-2 text-red-400 hover:text-red-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {ingredientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    {t('stockIngredienteSinRegistros', language)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-white/10">
          {ingredientes.map((ing) => (
            <div
              key={ing.id}
              className={`p-4 hover:bg-white/5 transition-colors ${isLowStock(ing) ? 'bg-red-500/5' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-white">{ing.nombre}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400">{ing.unidad}</span>
                    <StockBadge ingrediente={ing} />
                    <span className="text-xs text-slate-400">
                      Umbral: {ing.umbralAlerta} {ing.unidad}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(ing)}
                    aria-label={`${t('edit', language)} ${ing.nombre}`}
                    className="p-2 text-cyan-400 hover:bg-cyan-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ing.id, ing.nombre)}
                    aria-label={`${t('delete', language)} ${ing.nombre}`}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {ingredientes.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              {t('stockIngredienteSinRegistros', language)}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('stockIngredienteEditar', language) : t('stockIngredienteNuevo', language)}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Modifica nombre, unidad o umbral. La cantidad se ajusta desde Movimientos.'
                : 'Crea un nuevo ingrediente para el stock.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="ing-nombre" className="block text-sm font-medium text-foreground mb-1">
                {t('stockIngredienteNombre', language)} <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <Input
                id="ing-nombre"
                type="text"
                required
                maxLength={120}
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="ing-unidad" className="block text-sm font-medium text-foreground mb-1">
                {t('stockIngredienteUnidad', language)} <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <select
                id="ing-unidad"
                value={formData.unidad}
                onChange={(e) => setFormData({ ...formData, unidad: e.target.value as UnidadMedida })}
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-colors cursor-pointer"
                aria-label={t('stockIngredienteUnidad', language)}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {!editingId && (
              <div>
                <label htmlFor="ing-cantidad" className="block text-sm font-medium text-foreground mb-1">
                  {t('stockIngredienteCantidad', language)}
                </label>
                <Input
                  id="ing-cantidad"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.cantidadActual}
                  onChange={(e) => setFormData({ ...formData, cantidadActual: Number(e.target.value) })}
                />
              </div>
            )}

            <div>
              <label htmlFor="ing-umbral" className="block text-sm font-medium text-foreground mb-1">
                {t('stockIngredienteUmbral', language)}
              </label>
              <Input
                id="ing-umbral"
                type="number"
                min={0}
                step={0.01}
                value={formData.umbralAlerta}
                onChange={(e) => setFormData({ ...formData, umbralAlerta: Number(e.target.value) })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" type="button" onClick={closeModal}>
                {t('cancel', language)}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t('savingProgress', language)}
                  </>
                ) : (
                  t('save', language)
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

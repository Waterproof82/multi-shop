'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
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
import type { Proveedor, CreateProveedorDTO } from '@/core/domain/entities/compras-types';

interface ProveedorFormData {
  nombre: string;
  cif: string;
  email: string;
  telefono: string;
  condicionesPago: string;
  direccionFiscal: string;
  observaciones: string;
}

const emptyForm: ProveedorFormData = {
  nombre: '',
  cif: '',
  email: '',
  telefono: '',
  condicionesPago: '',
  direccionFiscal: '',
  observaciones: '',
};

function buildDto(form: ProveedorFormData): CreateProveedorDTO {
  return {
    nombre: form.nombre,
    ...(form.cif && { cif: form.cif }),
    ...(form.email && { email: form.email }),
    ...(form.telefono && { telefono: form.telefono }),
    ...(form.condicionesPago && { condicionesPago: form.condicionesPago }),
    ...(form.direccionFiscal && { direccionFiscal: form.direccionFiscal }),
    ...(form.observaciones && { observaciones: form.observaciones }),
  };
}

function ActivoBadge({ activo }: Readonly<{ activo: boolean }>) {
  if (activo) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-medium">
        Activo
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full bg-slate-500/20 border border-slate-400/30 text-slate-400 text-xs font-medium">
      Inactivo
    </span>
  );
}

export default function ProveedoresPage() {
  const { language } = useLanguage();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ProveedorFormData>(emptyForm);
  const [error, setError] = useState('');

  const fetchProveedores = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/compras/proveedores');
      if (!res.ok) throw new Error('Error al cargar proveedores');
      const data = await res.json();
      setProveedores(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const url = editingId
        ? `/api/admin/compras/proveedores/${editingId}`
        : '/api/admin/compras/proveedores';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetchWithCsrf(url, {
        method,
        body: JSON.stringify(buildDto(formData)),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al guardar');
      }

      await fetchProveedores();
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
      const res = await fetchWithCsrf(`/api/admin/compras/proveedores/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar');
      await fetchProveedores();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const openEditModal = (prov: Proveedor) => {
    setFormData({
      nombre: prov.nombre,
      cif: prov.cif ?? '',
      email: prov.email ?? '',
      telefono: prov.telefono ?? '',
      condicionesPago: prov.condicionesPago ?? '',
      direccionFiscal: prov.direccionFiscal ?? '',
      observaciones: prov.observaciones ?? '',
    });
    setEditingId(prov.id);
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

  const updateField = (field: keyof ProveedorFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('comprasProveedores', language)}</h1>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4" />
          <span>{t('comprasNuevoProveedor', language)}</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">CIF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Teléfono</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('actions', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {proveedores.map((prov) => (
                <tr key={prov.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{prov.nombre}</td>
                  <td className="px-4 py-3 text-slate-300">{prov.cif ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{prov.email ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{prov.telefono ?? '—'}</td>
                  <td className="px-4 py-3"><ActivoBadge activo={prov.activo} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditModal(prov)}
                      aria-label={`${t('edit', language)} ${prov.nombre}`}
                      className="p-2 text-cyan-400 hover:text-cyan-300 mr-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(prov.id, prov.nombre)}
                      aria-label={`${t('delete', language)} ${prov.nombre}`}
                      className="p-2 text-red-400 hover:text-red-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {proveedores.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Sin proveedores todavía
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('comprasEditarProveedor', language) : t('comprasNuevoProveedor', language)}
            </DialogTitle>
            <DialogDescription>
              {editingId ? 'Modifica los datos del proveedor.' : 'Crea un nuevo proveedor.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="prov-nombre" className="block text-sm font-medium text-foreground mb-1">
                Nombre <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <Input
                id="prov-nombre"
                type="text"
                required
                maxLength={200}
                value={formData.nombre}
                onChange={updateField('nombre')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="prov-cif" className="block text-sm font-medium text-foreground mb-1">CIF</label>
                <Input id="prov-cif" type="text" maxLength={20} value={formData.cif} onChange={updateField('cif')} />
              </div>
              <div>
                <label htmlFor="prov-telefono" className="block text-sm font-medium text-foreground mb-1">Teléfono</label>
                <Input id="prov-telefono" type="text" maxLength={30} value={formData.telefono} onChange={updateField('telefono')} />
              </div>
            </div>

            <div>
              <label htmlFor="prov-email" className="block text-sm font-medium text-foreground mb-1">Email</label>
              <Input id="prov-email" type="email" maxLength={200} value={formData.email} onChange={updateField('email')} />
            </div>

            <div>
              <label htmlFor="prov-condiciones" className="block text-sm font-medium text-foreground mb-1">Condiciones de pago</label>
              <Input id="prov-condiciones" type="text" maxLength={300} value={formData.condicionesPago} onChange={updateField('condicionesPago')} />
            </div>

            <div>
              <label htmlFor="prov-direccion" className="block text-sm font-medium text-foreground mb-1">Dirección fiscal</label>
              <Input id="prov-direccion" type="text" maxLength={400} value={formData.direccionFiscal} onChange={updateField('direccionFiscal')} />
            </div>

            <div>
              <label htmlFor="prov-observaciones" className="block text-sm font-medium text-foreground mb-1">Observaciones</label>
              <textarea
                id="prov-observaciones"
                maxLength={1000}
                rows={3}
                value={formData.observaciones}
                onChange={updateField('observaciones')}
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-colors resize-none"
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { AlbaranCompra, CatalogoCompraItem, PorcentajeIva } from '@/core/domain/entities/compras-types';
import { albaranEstadoClass } from '../../compras-utils';
import { useComprasTipoImpuesto, getRateOptions } from '../../compras-context';

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2) + ' €';
}

interface AddItemForm {
  catalogoCompraId: string;
  cantidadRecibida: string;
  precioCompraEuros: string;
  porcentajeIva: string;
  numeroLote: string;
  fechaCaducidad: string;
}

const emptyAddForm: AddItemForm = {
  catalogoCompraId: '',
  cantidadRecibida: '1',
  precioCompraEuros: '0',
  porcentajeIva: '21',
  numeroLote: '',
  fechaCaducidad: '',
};

function selectedCatalogoItem(catalogo: CatalogoCompraItem[], id: string): CatalogoCompraItem | undefined {
  return catalogo.find((c) => c.id === id);
}

export default function AlbaranDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const { language } = useLanguage();
  const tipoImpuesto = useComprasTipoImpuesto();
  const rateOptions = getRateOptions(tipoImpuesto);
  const [albaran, setAlbaran] = useState<AlbaranCompra | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoCompraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addForm, setAddForm] = useState<AddItemForm>(emptyAddForm);
  const [error, setError] = useState('');

  const fetchAlbaran = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/compras/albaranes/${id}`);
      if (!res.ok) throw new Error('Albarán no encontrado');
      const data = await res.json();
      setAlbaran(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAlbaran();
  }, [fetchAlbaran]);

  const fetchCatalogo = useCallback(async (proveedorId: string) => {
    try {
      const res = await fetch(`/api/admin/compras/proveedores/${proveedorId}/catalogo`);
      if (!res.ok) return;
      const data = await res.json();
      setCatalogo(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (albaran?.proveedorId) {
      fetchCatalogo(albaran.proveedorId);
    }
  }, [albaran?.proveedorId, fetchCatalogo]);

  const handleAddItem = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        catalogoCompraId: addForm.catalogoCompraId,
        cantidadRecibida: Number(addForm.cantidadRecibida),
        precioCompraCents: Math.round(Number(addForm.precioCompraEuros) * 100),
        porcentajeIva: Number(addForm.porcentajeIva) as PorcentajeIva,
      };
      if (addForm.numeroLote) body.numeroLote = addForm.numeroLote;
      if (addForm.fechaCaducidad) body.fechaCaducidad = addForm.fechaCaducidad;

      const res = await fetchWithCsrf(`/api/admin/compras/albaranes/${id}/items`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al añadir ítem');
      }

      await fetchAlbaran();
      setAddForm(emptyAddForm);
      setShowAddItem(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleRecibir = async () => {
    if (!confirm(t('comprasConfirmarRecibirAlbaran', language))) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetchWithCsrf(`/api/admin/compras/albaranes/${id}/recibir`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al marcar como recibido');
      }
      await fetchAlbaran();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const updateAddForm = (field: keyof AddItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAddForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!albaran) {
    return (
      <div className="text-center text-muted-foreground py-16">
        {error || t('comprasAlbaranNoEncontrado', language)}
      </div>
    );
  }

  const isDraft = albaran.estado === 'borrador';
  const selectedItem = selectedCatalogoItem(catalogo, addForm.catalogoCompraId);
  const isPerecedero = selectedItem?.esPerecedero ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href="/admin/compras/albaranes"
          className="p-2 text-muted-foreground hover:text-foreground rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
          aria-label={t('comprasVolverAAlbaranes', language)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground font-mono">{albaran.numeroAlbaran}</h1>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${albaranEstadoClass(albaran.estado)}`}>
              {isDraft ? t('comprasEstadoBorrador', language) : t('comprasEstadoRecibido', language)}
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">{albaran.proveedorNombre}</p>
        </div>
        {isDraft && (
          <Button onClick={handleRecibir} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('comprasMarcarRecibido', language)}
          </Button>
        )}
      </div>

      {!isDraft && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-300 text-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{t('comprasAlbaranInmutable', language)}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase">{t('comprasItemsAlbaran', language)}</h2>
          {isDraft && (
            <Button variant="outline" onClick={() => setShowAddItem(!showAddItem)}>
              <Plus className="h-4 w-4" />
              <span>{t('comprasAnadirItem', language)}</span>
            </Button>
          )}
        </div>

        {isDraft && showAddItem && (
          <form onSubmit={handleAddItem} className="px-4 py-4 border-b border-border bg-muted/30 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="item-catalogo" className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('comprasArticulo', language)} <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <select
                  id="item-catalogo"
                  required
                  value={addForm.catalogoCompraId}
                  onChange={updateAddForm('catalogoCompraId')}
                  aria-label="Seleccionar artículo del catálogo"
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  <option value="">{t('comprasSeleccionarArticulo', language)}</option>
                  {catalogo.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.ingredienteNombre} {item.esPerecedero ? t('comprasPerecedero', language) : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="item-cantidad" className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('comprasCantRecibida', language)} <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="item-cantidad"
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={addForm.cantidadRecibida}
                  onChange={updateAddForm('cantidadRecibida')}
                />
              </div>

              <div>
                <label htmlFor="item-precio" className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('price', language)} (€) <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="item-precio"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={addForm.precioCompraEuros}
                  onChange={updateAddForm('precioCompraEuros')}
                />
              </div>

              <div>
                <label htmlFor="item-iva" className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('comprasIva', language)} (%) <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <select
                  id="item-iva"
                  required
                  value={addForm.porcentajeIva}
                  onChange={updateAddForm('porcentajeIva')}
                  aria-label="Porcentaje de IVA"
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  {rateOptions.map(({ value, labelKey }) => (
                    <option key={value} value={value}>{t(labelKey, language)}</option>
                  ))}
                </select>
              </div>

              {isPerecedero && (
                <>
                  <div>
                    <label htmlFor="item-lote" className="block text-xs font-medium text-muted-foreground mb-1">
                      {t('comprasNumeroLote', language)} <span className="text-destructive" aria-hidden="true">*</span>
                    </label>
                    <Input
                      id="item-lote"
                      type="text"
                      required={isPerecedero}
                      maxLength={100}
                      value={addForm.numeroLote}
                      onChange={updateAddForm('numeroLote')}
                    />
                  </div>
                  <div>
                    <label htmlFor="item-caducidad" className="block text-xs font-medium text-muted-foreground mb-1">
                      {t('comprasFechaCaducidad', language)} <span className="text-destructive" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="item-caducidad"
                      type="date"
                      required={isPerecedero}
                      value={addForm.fechaCaducidad}
                      onChange={updateAddForm('fechaCaducidad')}
                      className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {t('comprasIngredientePerecedero', language)}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setShowAddItem(false)}>
                {t('cancel', language)}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t('save', language)}
              </Button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasIngrediente', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasCantRecibida', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('price', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasIva', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasLote', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasCaducidad', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(albaran.items ?? []).map((item) => (
                <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-foreground">{item.ingredienteNombre ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.cantidadRecibida} {item.unidadCompra}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatEuros(item.precioCompraCents)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.porcentajeIva}%</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.numeroLote ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.fechaCaducidad ? new Date(item.fechaCaducidad).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {(albaran.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    {t('comprasSinItems', language)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

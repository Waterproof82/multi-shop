'use client';

import { useState, useEffect, useCallback } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { PedidoCompra, CatalogoCompraItem, PedidoCompraEstado } from '@/core/domain/entities/compras-types';
import { pedidoEstadoClass } from '../../compras-utils';

type Lang = Parameters<typeof t>[1];

function estadoLabel(estado: PedidoCompraEstado, language: Lang): string {
  if (estado === 'borrador') return t('comprasEstadoBorrador', language);
  if (estado === 'enviado') return t('comprasEstadoEnviado', language);
  if (estado === 'recibido') return t('comprasEstadoRecibido', language);
  return t('comprasEstadoCancelado', language);
}

function EstadoBadge({ estado, language }: Readonly<{ estado: PedidoCompraEstado; language: Lang }>) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${pedidoEstadoClass(estado)}`}>
      {estadoLabel(estado, language)}
    </span>
  );
}

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2) + ' €';
}

export default function PedidoDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const { language } = useLanguage();
  const [pedido, setPedido] = useState<PedidoCompra | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoCompraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addForm, setAddForm] = useState({ catalogoCompraId: '', cantidad: '1' });
  const [error, setError] = useState('');

  const fetchPedido = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/compras/pedidos/${id}`);
      if (!res.ok) throw new Error('Pedido no encontrado');
      const data = await res.json();
      setPedido(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPedido();
  }, [fetchPedido]);

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
    if (pedido?.proveedorId) {
      fetchCatalogo(pedido.proveedorId);
    }
  }, [pedido?.proveedorId, fetchCatalogo]);

  const handleAddItem = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetchWithCsrf(`/api/admin/compras/pedidos/${id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          catalogoCompraId: addForm.catalogoCompraId,
          cantidad: Number(addForm.cantidad),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al añadir ítem');
      }
      await fetchPedido();
      setAddForm({ catalogoCompraId: '', cantidad: '1' });
      setShowAddItem(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (endpoint: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetchWithCsrf(`/api/admin/compras/pedidos/${id}/${endpoint}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error');
      }
      await fetchPedido();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const updateAddForm = (field: keyof typeof addForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAddForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="text-center text-muted-foreground py-16">
        {error || t('comprasPedidoNoEncontrado', language)}
      </div>
    );
  }

  const isDraft = pedido.estado === 'borrador';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/compras/pedidos"
          className="p-2 text-muted-foreground hover:text-foreground rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
          aria-label={t('comprasVolverAPedidos', language)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground font-mono">{pedido.numeroPedido}</h1>
            <EstadoBadge estado={pedido.estado} language={language} />
          </div>
          <p className="text-muted-foreground text-sm mt-1">{pedido.proveedorNombre} · {new Date(pedido.fechaPedido).toLocaleDateString()}</p>
        </div>
        {isDraft && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleAction('cancelar', t('comprasConfirmarCancelar', language))}
              disabled={saving}
            >
              {t('comprasCancelarPedido', language)}
            </Button>
            <Button
              onClick={() => handleAction('enviar', t('comprasConfirmarEnviar', language))}
              disabled={saving}
            >
              {t('comprasEnviarPedido', language)}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase">{t('comprasItemsPedido', language)}</h2>
          {isDraft && (
            <Button variant="outline" onClick={() => setShowAddItem(!showAddItem)}>
              <Plus className="h-4 w-4" />
              <span>{t('comprasAnadirItem', language)}</span>
            </Button>
          )}
        </div>

        {isDraft && showAddItem && (
          <form onSubmit={handleAddItem} className="px-4 py-4 border-b border-border bg-muted/30 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      {item.ingredienteNombre} — {item.unidadCompra} ({formatEuros(item.precioCompraCents)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="item-cantidad" className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('comprasCantidad', language)} <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <input
                  id="item-cantidad"
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={addForm.cantidad}
                  onChange={updateAddForm('cantidad')}
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasCantidad', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('price', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasIva', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(pedido.items ?? []).map((item) => (
                <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-foreground">{item.ingredienteNombre ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.cantidad} {item.unidadCompra}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatEuros(item.precioCompraCents)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.porcentajeIva}%</td>
                </tr>
              ))}
              {(pedido.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
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

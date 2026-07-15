'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { AlbaranCompra, Proveedor, AlbaranEstado } from '@/core/domain/entities/compras-types';

type Lang = Parameters<typeof t>[1];

function estadoLabel(estado: AlbaranEstado, language: Lang): string {
  return estado === 'recibido' ? t('comprasEstadoRecibido', language) : t('comprasEstadoBorrador', language);
}

function estadoClass(estado: AlbaranEstado): string {
  return estado === 'recibido'
    ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
    : 'bg-yellow-500/20 border-yellow-400/30 text-yellow-300';
}

function EstadoBadge({ estado, language }: Readonly<{ estado: AlbaranEstado; language: Lang }>) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${estadoClass(estado)}`}>
      {estadoLabel(estado, language)}
    </span>
  );
}

const ESTADOS: Array<AlbaranEstado | ''> = ['', 'borrador', 'recibido'];

export default function AlbaranesPage() {
  const { language } = useLanguage();
  const [albaranes, setAlbaranes] = useState<AlbaranCompra[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<AlbaranEstado | ''>('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ proveedorId: '', numeroAlbaran: '', notas: '' });

  const fetchAlbaranes = useCallback(async () => {
    try {
      const params = filtroEstado ? `?estado=${filtroEstado}` : '';
      const res = await fetch(`/api/admin/compras/albaranes${params}`);
      if (!res.ok) throw new Error('Error al cargar albaranes');
      const data = await res.json();
      setAlbaranes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  const fetchProveedores = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/compras/proveedores');
      if (!res.ok) return;
      const data = await res.json();
      setProveedores(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAlbaranes();
  }, [fetchAlbaranes]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const handleCreate = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        proveedorId: form.proveedorId,
        numeroAlbaran: form.numeroAlbaran,
      };
      if (form.notas) body.notas = form.notas;

      const res = await fetchWithCsrf('/api/admin/compras/albaranes', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al crear albarán');
      }

      await fetchAlbaranes();
      setIsModalOpen(false);
      setForm({ proveedorId: '', numeroAlbaran: '', notas: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">{t('comprasAlbaranes', language)}</h1>
        <div className="flex items-center gap-3">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as AlbaranEstado | '')}
            aria-label="Filtrar por estado"
            className="px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'Todos los estados' : estadoLabel(s, language)}
              </option>
            ))}
          </select>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>{t('comprasNuevoAlbaran', language)}</span>
          </Button>
        </div>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Número</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Fecha recepción</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('actions', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {albaranes.map((alb) => (
                <tr key={alb.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-mono text-white">{alb.numeroAlbaran}</td>
                  <td className="px-4 py-3 text-slate-300">{alb.proveedorNombre ?? '—'}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={alb.estado} language={language} /></td>
                  <td className="px-4 py-3 text-slate-300">
                    {alb.fechaRecepcion ? new Date(alb.fechaRecepcion).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/compras/albaranes/${alb.id}`}
                      aria-label={`Ver albarán ${alb.numeroAlbaran}`}
                      className="p-2 text-cyan-400 hover:text-cyan-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {albaranes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    Sin albaranes todavía
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) setIsModalOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('comprasNuevoAlbaran', language)}</DialogTitle>
            <DialogDescription>Registra un nuevo albarán de entrega.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="alb-proveedor" className="block text-sm font-medium text-foreground mb-1">
                Proveedor <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <select
                id="alb-proveedor"
                required
                value={form.proveedorId}
                onChange={updateForm('proveedorId')}
                aria-label="Seleccionar proveedor"
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              >
                <option value="">Seleccionar proveedor...</option>
                {proveedores.map((prov) => (
                  <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="alb-numero" className="block text-sm font-medium text-foreground mb-1">
                Número de albarán <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <Input
                id="alb-numero"
                type="text"
                required
                maxLength={100}
                value={form.numeroAlbaran}
                onChange={updateForm('numeroAlbaran')}
              />
            </div>

            <div>
              <label htmlFor="alb-notas" className="block text-sm font-medium text-foreground mb-1">Notas</label>
              <textarea
                id="alb-notas"
                maxLength={1000}
                rows={3}
                value={form.notas}
                onChange={updateForm('notas')}
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                {t('cancel', language)}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t('save', language)}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

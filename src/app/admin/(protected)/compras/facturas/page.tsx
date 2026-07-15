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
import type { FacturaProveedor, Proveedor, AlbaranCompra, EstadoPago } from '@/core/domain/entities/compras-types';
import { estadoPagoClass } from '../compras-utils';

type Lang = Parameters<typeof t>[1];

function estadoPagoLabel(estado: EstadoPago, language: Lang): string {
  if (estado === 'pendiente') return t('comprasEstadoPendiente', language);
  if (estado === 'pagado_caja') return t('comprasEstadoPagadoCaja', language);
  return t('comprasEstadoPagadoBanco', language);
}

function EstadoPagoBadge({ estado, language }: Readonly<{ estado: EstadoPago; language: Lang }>) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoPagoClass(estado)}`}>
      {estadoPagoLabel(estado, language)}
    </span>
  );
}

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2) + ' €';
}

interface FacturaForm {
  proveedorId: string;
  numeroFactura: string;
  fechaFactura: string;
  base0: string;
  base4: string;
  base10: string;
  base21: string;
  ivaManual: string;
  albaranIds: string[];
}

const emptyFacturaForm: FacturaForm = {
  proveedorId: '',
  numeroFactura: '',
  fechaFactura: new Date().toISOString().slice(0, 10),
  base0: '0',
  base4: '0',
  base10: '0',
  base21: '0',
  ivaManual: '',
  albaranIds: [],
};

function calcIva(form: FacturaForm): number {
  const base4 = Number(form.base4) * 0.04;
  const base10 = Number(form.base10) * 0.10;
  const base21 = Number(form.base21) * 0.21;
  return Math.round((base4 + base10 + base21) * 100) / 100;
}

function calcTotal(form: FacturaForm): number {
  const base = Number(form.base0) + Number(form.base4) + Number(form.base10) + Number(form.base21);
  const iva = form.ivaManual !== '' ? Number(form.ivaManual) : calcIva(form);
  return Math.round((base + iva) * 100) / 100;
}

const ESTADOS_PAGO: Array<EstadoPago | ''> = ['', 'pendiente', 'pagado_caja', 'pagado_banco'];

export default function FacturasPage() {
  const { language } = useLanguage();
  const [facturas, setFacturas] = useState<FacturaProveedor[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [albaranesRecibidos, setAlbaranesRecibidos] = useState<AlbaranCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<EstadoPago | ''>('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<FacturaForm>(emptyFacturaForm);

  const fetchFacturas = useCallback(async () => {
    try {
      const params = filtroEstado ? `?estadoPago=${filtroEstado}` : '';
      const res = await fetch(`/api/admin/compras/facturas${params}`);
      if (!res.ok) throw new Error('Error al cargar facturas');
      const data = await res.json();
      setFacturas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  const fetchSecondaryData = useCallback(async () => {
    try {
      const [resProveedores, resAlbaranes] = await Promise.all([
        fetch('/api/admin/compras/proveedores'),
        fetch('/api/admin/compras/albaranes?estado=recibido'),
      ]);
      if (resProveedores.ok) setProveedores(await resProveedores.json());
      if (resAlbaranes.ok) setAlbaranesRecibidos(await resAlbaranes.json());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchFacturas();
  }, [fetchFacturas]);

  useEffect(() => {
    fetchSecondaryData();
  }, [fetchSecondaryData]);

  const handleCreate = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const ivaFinal = form.ivaManual !== '' ? Number(form.ivaManual) : calcIva(form);
      const totalFinal = calcTotal(form);

      const body = {
        proveedorId: form.proveedorId,
        numeroFactura: form.numeroFactura,
        fechaFactura: form.fechaFactura,
        baseImponible0Cents: Math.round(Number(form.base0) * 100),
        baseImponible4Cents: Math.round(Number(form.base4) * 100),
        baseImponible10Cents: Math.round(Number(form.base10) * 100),
        baseImponible21Cents: Math.round(Number(form.base21) * 100),
        ivaSoportadoCents: Math.round(ivaFinal * 100),
        totalFacturaCents: Math.round(totalFinal * 100),
        albaranIds: form.albaranIds,
      };

      const res = await fetchWithCsrf('/api/admin/compras/facturas', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al crear factura');
      }

      await fetchFacturas();
      setIsModalOpen(false);
      setForm(emptyFacturaForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Omit<FacturaForm, 'albaranIds'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const toggleAlbaran = (albaranId: string) => {
    setForm((prev) => {
      const ids = prev.albaranIds.includes(albaranId)
        ? prev.albaranIds.filter((x) => x !== albaranId)
        : [...prev.albaranIds, albaranId];
      return { ...prev, albaranIds: ids };
    });
  };

  const calculatedIva = calcIva(form);
  const displayIva = form.ivaManual !== '' ? Number(form.ivaManual) : calculatedIva;
  const displayTotal = calcTotal(form);

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
        <h1 className="text-2xl font-bold text-foreground">{t('comprasFacturas', language)}</h1>
        <div className="flex items-center gap-3">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoPago | '')}
            aria-label="Filtrar por estado de pago"
            className="px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {ESTADOS_PAGO.map((s) => (
              <option key={s} value={s}>
                {s === '' ? t('comprasTodosEstados', language) : estadoPagoLabel(s, language)}
              </option>
            ))}
          </select>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>{t('comprasNuevaFactura', language)}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasNumero', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasProveedor', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasTotal', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('comprasEstadoPago', language)}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('date', language)}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('actions', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {facturas.map((fac) => (
                <tr key={fac.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-foreground">{fac.numeroFactura}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fac.proveedorNombre ?? '—'}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{formatEuros(fac.totalFacturaCents)}</td>
                  <td className="px-4 py-3"><EstadoPagoBadge estado={fac.estadoPago} language={language} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(fac.fechaFactura).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/compras/facturas/${fac.id}`}
                      aria-label={`${t('comprasVer', language)} ${fac.numeroFactura}`}
                      className="p-2 text-cyan-400 hover:text-cyan-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    {t('comprasSinFacturas', language)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) setIsModalOpen(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('comprasNuevaFactura', language)}</DialogTitle>
            <DialogDescription>{t('comprasDescNuevaFactura', language)}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="fac-proveedor" className="block text-sm font-medium text-foreground mb-1">
                {t('comprasProveedor', language)} <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <select
                id="fac-proveedor"
                required
                value={form.proveedorId}
                onChange={updateField('proveedorId')}
                aria-label="Seleccionar proveedor"
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              >
                <option value="">{t('comprasSeleccionarProveedor', language)}</option>
                {proveedores.map((prov) => (
                  <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="fac-numero" className="block text-sm font-medium text-foreground mb-1">
                  {t('comprasNumeroPorcentaje', language)} <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="fac-numero"
                  type="text"
                  required
                  maxLength={100}
                  value={form.numeroFactura}
                  onChange={updateField('numeroFactura')}
                />
              </div>
              <div>
                <label htmlFor="fac-fecha" className="block text-sm font-medium text-foreground mb-1">
                  {t('comprasFechaFactura', language)} <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <input
                  id="fac-fecha"
                  type="date"
                  required
                  value={form.fechaFactura}
                  onChange={updateField('fechaFactura')}
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">{t('comprasBaseImponible', language)} (€)</p>
              <div className="grid grid-cols-2 gap-3">
                {(['base0', 'base4', 'base10', 'base21'] as const).map((field, idx) => {
                  const baseLabels = [
                    t('comprasBase0', language),
                    t('comprasBase4', language),
                    t('comprasBase10', language),
                    t('comprasBase21', language),
                  ];
                  return (
                    <div key={field}>
                      <label htmlFor={`fac-${field}`} className="block text-xs font-medium text-muted-foreground mb-1">{baseLabels[idx]}</label>
                      <Input
                        id={`fac-${field}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={form[field]}
                        onChange={updateField(field)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="fac-iva" className="block text-sm font-medium text-foreground mb-1">
                  {t('comprasIvaSoportado', language)} (€)
                </label>
                <Input
                  id="fac-iva"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={calculatedIva.toFixed(2)}
                  value={form.ivaManual}
                  onChange={updateField('ivaManual')}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('comprasCalculado', language)} {calculatedIva.toFixed(2)} €</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('comprasTotalFactura', language)}</label>
                <div className="px-3 py-2 rounded-md border border-border bg-muted/50 text-foreground font-medium">
                  {displayTotal.toFixed(2)} €
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('comprasIvaCalc', language)} {displayIva.toFixed(2)} €</p>
              </div>
            </div>

            {albaranesRecibidos.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">{t('comprasAlbaranesVinculados', language)}</p>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {albaranesRecibidos.map((alb) => (
                    <label key={alb.id} className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <input
                        type="checkbox"
                        checked={form.albaranIds.includes(alb.id)}
                        onChange={() => toggleAlbaran(alb.id)}
                        className="rounded border-border"
                      />
                      {alb.numeroAlbaran} — {alb.proveedorNombre}
                    </label>
                  ))}
                </div>
              </div>
            )}

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

'use client';

import { useState, useEffect, useCallback } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { FacturaProveedor, EstadoPago } from '@/core/domain/entities/compras-types';

type Lang = Parameters<typeof t>[1];

function estadoPagoLabel(estado: EstadoPago, language: Lang): string {
  if (estado === 'pendiente') return t('comprasEstadoPendiente', language);
  if (estado === 'pagado_caja') return t('comprasEstadoPagadoCaja', language);
  return t('comprasEstadoPagadoBanco', language);
}

function estadoPagoClass(estado: EstadoPago): string {
  if (estado === 'pendiente') return 'bg-yellow-500/20 border-yellow-400/30 text-yellow-300';
  if (estado === 'pagado_caja') return 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300';
  return 'bg-blue-500/20 border-blue-400/30 text-blue-300';
}

function EstadoPagoBadge({ estado, language }: Readonly<{ estado: EstadoPago; language: Lang }>) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${estadoPagoClass(estado)}`}>
      {estadoPagoLabel(estado, language)}
    </span>
  );
}

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2) + ' €';
}

interface PagoForm {
  metodoPago: 'pagado_caja' | 'pagado_banco';
  turnoId: string;
}

export default function FacturaDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const { language } = useLanguage();
  const [factura, setFactura] = useState<FacturaProveedor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPago, setShowPago] = useState(false);
  const [pagoForm, setPagoForm] = useState<PagoForm>({ metodoPago: 'pagado_caja', turnoId: '' });
  const [error, setError] = useState('');

  const fetchFactura = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/compras/facturas/${id}`);
      if (!res.ok) throw new Error('Factura no encontrada');
      const data = await res.json();
      setFactura(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchFactura();
  }, [fetchFactura]);

  const handlePago = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, unknown> = { metodoPago: pagoForm.metodoPago };
      if (pagoForm.turnoId) body.turnoId = pagoForm.turnoId;

      const res = await fetchWithCsrf(`/api/admin/compras/facturas/${id}/pagar`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error al registrar pago');
      }

      await fetchFactura();
      setShowPago(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const updatePagoForm = (field: keyof PagoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setPagoForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="text-center text-slate-400 py-16">
        {error || 'Factura no encontrada'}
      </div>
    );
  }

  const isPendiente = factura.estadoPago === 'pendiente';

  const ivaRows = [
    { label: `${t('comprasBaseImponible', language)} 0%`, value: factura.baseImponible0Cents },
    { label: `${t('comprasBaseImponible', language)} 4%`, value: factura.baseImponible4Cents },
    { label: `${t('comprasBaseImponible', language)} 10%`, value: factura.baseImponible10Cents },
    { label: `${t('comprasBaseImponible', language)} 21%`, value: factura.baseImponible21Cents },
    { label: t('comprasIvaSoportado', language), value: factura.ivaSoportadoCents },
    { label: t('comprasTotalFactura', language), value: factura.totalFacturaCents, bold: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href="/admin/compras/facturas"
          className="p-2 text-slate-400 hover:text-white rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
          aria-label="Volver a facturas"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white font-mono">{factura.numeroFactura}</h1>
            <EstadoPagoBadge estado={factura.estadoPago} language={language} />
          </div>
          <p className="text-slate-400 text-sm mt-1">
            {factura.proveedorNombre} · {new Date(factura.fechaFactura).toLocaleDateString()} · {formatEuros(factura.totalFacturaCents)}
          </p>
        </div>
        {isPendiente && (
          <Button onClick={() => setShowPago(!showPago)}>
            {t('comprasRegistrarPago', language)}
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      {isPendiente && showPago && (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-6">
          <h2 className="text-sm font-medium text-slate-300 uppercase mb-4">{t('comprasRegistrarPago', language)}</h2>
          <form onSubmit={handlePago} className="space-y-4">
            <div>
              <label htmlFor="pago-metodo" className="block text-sm font-medium text-foreground mb-1">
                Método de pago <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <select
                id="pago-metodo"
                required
                value={pagoForm.metodoPago}
                onChange={updatePagoForm('metodoPago')}
                aria-label="Método de pago"
                className="w-full sm:w-64 px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              >
                <option value="pagado_caja">{t('comprasPagoMetodoCaja', language)}</option>
                <option value="pagado_banco">{t('comprasPagoMetodoBanco', language)}</option>
              </select>
            </div>

            {pagoForm.metodoPago === 'pagado_caja' && (
              <div>
                <label htmlFor="pago-turno" className="block text-sm font-medium text-foreground mb-1">
                  ID de turno (opcional)
                </label>
                <input
                  id="pago-turno"
                  type="text"
                  maxLength={36}
                  placeholder="UUID del turno..."
                  value={pagoForm.turnoId}
                  onChange={updatePagoForm('turnoId')}
                  className="w-full sm:w-64 px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t('comprasRegistrarPago', language)}
              </Button>
              <Button variant="outline" type="button" onClick={() => setShowPago(false)}>
                {t('cancel', language)}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-medium text-slate-300 uppercase">Desglose IVA</h2>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/10">
              {ivaRows.map((row) => (
                <tr key={row.label} className="hover:bg-white/5 transition-colors">
                  <td className={`px-4 py-3 ${row.bold ? 'text-white font-semibold' : 'text-slate-300'}`}>{row.label}</td>
                  <td className={`px-4 py-3 text-right ${row.bold ? 'text-white font-semibold' : 'text-slate-300'}`}>
                    {formatEuros(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(factura.albaranes ?? []).length > 0 && (
          <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-medium text-slate-300 uppercase">Albaranes vinculados</h2>
            </div>
            <div className="divide-y divide-white/10">
              {(factura.albaranes ?? []).map((alb) => (
                <div key={alb.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <span className="text-white font-mono">{alb.numeroAlbaran}</span>
                  <span className="text-slate-400 text-sm">{alb.proveedorNombre}</span>
                  <Link
                    href={`/admin/compras/albaranes/${alb.id}`}
                    className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-sm"
                  >
                    Ver
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

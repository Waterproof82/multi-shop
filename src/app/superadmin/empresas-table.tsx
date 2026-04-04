'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Building2, AlertCircle, CheckCircle } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { PillSwitch } from '@/components/ui/pill-switch';

interface EmpresaStats {
  totalPedidos: number;
  pedidosPendientes: number;
  totalClientes: number;
  totalProductos: number;
  pedidosHoy: number;
  pedidosMes: number;
  cuponesPromoValidados: number;
  cuponesTgtgValidados: number;
  cuponesTgtgTotales: number;
}

interface EmpresaRow {
  id: string;
  nombre: string;
  dominio: string;
  logoUrl: string | null;
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
  stats: EmpresaStats;
}

interface ModuloSwitchProps {
  readonly empresaId: string;
  readonly field: 'mostrar_promociones' | 'mostrar_tgtg';
  readonly checked: boolean;
  readonly label: string;
}

function ModuloSwitch({ empresaId, field, checked: initialChecked, label }: ModuloSwitchProps) {
  const [checked, setChecked] = useState(initialChecked);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (saving) return;
    const next = !checked;
    setChecked(next);
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/superadmin/empresas/${empresaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) setChecked(!next);
    } catch {
      setChecked(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PillSwitch
      checked={checked}
      disabled={saving}
      onChange={handleToggle}
      ariaLabel={label}
      size="sm"
    />
  );
}

interface EmpresasTableProps {
  readonly empresas: EmpresaRow[];
}

export function EmpresasTable({ empresas }: EmpresasTableProps) {
  if (empresas.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No hay empresas registradas</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]" aria-label="Listado de empresas">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Empresa</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Dominio</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Hoy</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Mes</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Total</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Pendientes</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Clientes</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">
                <span className="flex flex-col items-center gap-0.5">
                  <span>Promos</span>
                  <span className="text-xs font-normal text-muted-foreground/70">envios</span>
                </span>
              </th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">
                <span className="flex flex-col items-center gap-0.5">
                  <span>TGTG</span>
                  <span className="text-xs font-normal text-muted-foreground/70">validados</span>
                </span>
              </th>
              <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {empresas.map((empresa) => (
              <tr key={empresa.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    {empresa.logoUrl ? (
                      <Image
                        src={empresa.logoUrl}
                        alt={empresa.nombre}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-lg object-contain bg-white border border-border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <span className="font-medium text-foreground">{empresa.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <a
                    href={`https://${empresa.dominio}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {empresa.dominio}
                  </a>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-sm font-medium text-primary">{empresa.stats.pedidosHoy}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-sm font-medium text-primary">{empresa.stats.pedidosMes}</span>
                </td>
                <td className="px-4 py-4 text-center text-foreground">
                  {empresa.stats.totalPedidos}
                </td>
                <td className="px-4 py-4 text-center">
                  {empresa.stats.pedidosPendientes > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm">
                      <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      {empresa.stats.pedidosPendientes}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                      <CheckCircle className="h-3 w-3" aria-hidden="true" />
                      0
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-center text-foreground">
                  {empresa.stats.totalClientes}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-medium text-primary">
                      {empresa.stats.cuponesPromoValidados > 0 ? `${empresa.stats.cuponesPromoValidados}` : '0'}
                    </span>
                    <ModuloSwitch
                      empresaId={empresa.id}
                      field="mostrar_promociones"
                      checked={empresa.mostrarPromociones}
                      label={`Activar Promociones para ${empresa.nombre}`}
                    />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-medium text-primary">
                      {empresa.stats.cuponesTgtgTotales > 0
                        ? `${empresa.stats.cuponesTgtgValidados}/${empresa.stats.cuponesTgtgTotales}`
                        : '—'}
                    </span>
                    <ModuloSwitch
                      empresaId={empresa.id}
                      field="mostrar_tgtg"
                      checked={empresa.mostrarTgtg}
                      label={`Activar TooGoodToGo para ${empresa.nombre}`}
                    />
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <a
                    href={`/api/superadmin/switch-empresa?empresaId=${empresa.id}`}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Editar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

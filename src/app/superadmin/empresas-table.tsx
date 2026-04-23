'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Building2, AlertCircle, CheckCircle, Globe, MapPin, Image as ImageIcon, FileText, Share2, ExternalLink, FileSearch } from 'lucide-react';
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
  seoStatus: {
    hasDescription: boolean;
    hasLogo: boolean;
    hasUrlMapa: boolean;
    hasGeoCoordinates: boolean;
    hasFb: boolean;
    hasInstagram: boolean;
    hasMetaDescription: boolean;
  };
}

interface ModuloSwitchProps {
  readonly empresaId: string;
  readonly field: 'mostrar_promociones' | 'mostrar_tgtg';
  readonly checked: boolean;
  readonly label: string;
}

function ModuloSwitch({ empresaId, field, checked: initialChecked, label }: ModuloSwitchProps) {
  const [mounted, setMounted] = useState(false);
  const [checked, setChecked] = useState(initialChecked);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Prevent hydration mismatch by rendering a neutral state until mounted
  if (!mounted) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={initialChecked}
        aria-label={label}
        disabled
        className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full p-0.5 bg-switch-inactive opacity-60 cursor-not-allowed"
      >
        <span aria-hidden="true" className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform translate-x-0" />
      </button>
    );
  }

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
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 text-center">
        <Building2 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-400">No hay empresas registradas</p>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]" aria-label="Listado de empresas">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Empresa</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Dominio</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">Hoy</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">Mes</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">Total</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">Pendientes</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">Clientes</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">
                <span className="flex flex-col items-center gap-0.5">
                  <span>Promos</span>
                  <span className="text-xs font-normal">envíos</span>
                </span>
              </th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">
                <span className="flex flex-col items-center gap-0.5">
                  <span>TGTG</span>
                  <span className="text-xs font-normal">validados</span>
                </span>
              </th>
              <th className="text-center px-4 py-3 text-sm font-medium text-slate-300">
                <span className="flex flex-col items-center gap-0.5">
                  <Globe className="h-4 w-4 mx-auto" />
                  <span className="text-xs">SEO</span>
                </span>
              </th>
              <th className="text-right px-4 py-3 text-sm font-medium text-slate-300">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {empresas.map((empresa) => (
              <tr key={empresa.id} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    {empresa.logoUrl ? (
                      <Image
                        src={empresa.logoUrl}
                        alt={empresa.nombre}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-lg object-contain bg-white/10 border border-white/20"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-white/70" />
                      </div>
                    )}
                    <span className="font-medium text-white">{empresa.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <a
                    href={`https://${empresa.dominio}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-cyan-400 hover:text-cyan-300 hover:underline"
                  >
                    {empresa.dominio}
                  </a>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-sm font-medium text-blue-300">{empresa.stats.pedidosHoy}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-sm font-medium text-cyan-300">{empresa.stats.pedidosMes}</span>
                </td>
                <td className="px-4 py-4 text-center text-white">
                  {empresa.stats.totalPedidos}
                </td>
                <td className="px-4 py-4 text-center">
                  {empresa.stats.pedidosPendientes > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-sm">
                      <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      {empresa.stats.pedidosPendientes}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-sm">
                      <CheckCircle className="h-3 w-3" aria-hidden="true" />
                      0
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-center text-white">
                  {empresa.stats.totalClientes}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-medium text-violet-300">
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
                    <span className="text-sm font-medium text-amber-300">
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
                <td className="px-4 py-4">
                  <div className="flex items-center justify-center gap-2" role="group" aria-label="Estado SEO">
                    {/* Logo */}
                    <span
                      className={`p-1.5 rounded ${empresa.seoStatus.hasLogo ? 'text-emerald-400' : 'text-red-400/60'}`}
                      title={empresa.seoStatus.hasLogo ? '✓ Logo configurado' : '✗ Falta logo'}
                    >
                      <ImageIcon className="h-4 w-4" aria-label={empresa.seoStatus.hasLogo ? 'Con logo' : 'Sin logo'} />
                    </span>
                    {/* Description */}
                    <span
                      className={`p-1.5 rounded ${empresa.seoStatus.hasDescription ? 'text-emerald-400' : 'text-red-400/60'}`}
                      title={empresa.seoStatus.hasDescription ? '✓ Descripción configurada' : '✗ Falta descripción'}
                    >
                      <FileText className="h-4 w-4" aria-label={empresa.seoStatus.hasDescription ? 'Con descripción' : 'Sin descripción'} />
                    </span>
                    {/* Geo coordinates */}
                    <span
                      className={`p-1.5 rounded ${empresa.seoStatus.hasGeoCoordinates ? 'text-emerald-400' : 'text-red-400/60'}`}
                      title={empresa.seoStatus.hasGeoCoordinates ? '✓ GPS detectado en url_mapa' : '✗ Falta GPS en url_mapa'}
                    >
                      <MapPin className="h-4 w-4" aria-label={empresa.seoStatus.hasGeoCoordinates ? 'Con geo' : 'Sin geo'} />
                    </span>
                    {/* Social */}
                    <span
                      className={`p-1.5 rounded ${empresa.seoStatus.hasFb || empresa.seoStatus.hasInstagram ? 'text-emerald-400' : 'text-red-400/60'}`}
                      title={empresa.seoStatus.hasFb || empresa.seoStatus.hasInstagram ? '✓ Redes sociales configuradas' : '✗ Falta Facebook o Instagram'}
                    >
                      <Share2 className="h-4 w-4" aria-label={empresa.seoStatus.hasFb || empresa.seoStatus.hasInstagram ? 'Con redes' : 'Sin redes'} />
                    </span>
                    {/* Sitemap - solo verificar */}
                    <a
                      href={`https://${empresa.dominio}/sitemap.xml`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded text-cyan-400 hover:bg-cyan-400/20 transition-colors"
                      title="Sitemap → Verificar en Google Search Console"
                    >
                      <FileSearch className="h-4 w-4" aria-label="Ver sitemap" />
                    </a>
                    {/* Robots - solo verificar */}
                    <a
                      href={`https://${empresa.dominio}/robots.txt`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded text-cyan-400 hover:bg-cyan-400/20 transition-colors"
                      title="robots.txt → Verificar acceso"
                    >
                      <ExternalLink className="h-4 w-4" aria-label="Ver robots.txt" />
                    </a>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <a
                    href={`/api/superadmin/switch-empresa?empresaId=${empresa.id}`}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 py-2 text-sm font-medium bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    Editar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Leyenda SEO */}
        <div className="px-4 py-3 bg-white/5 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {/* Iconos */}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-slate-300">
                <ImageIcon className="h-4 w-4 text-emerald-400" /> Logo
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <FileText className="h-4 w-4 text-emerald-400" /> Descripción
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <MapPin className="h-4 w-4 text-emerald-400" /> Mapa Google
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <Share2 className="h-4 w-4 text-emerald-400" /> Redes
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <FileSearch className="h-4 w-4 text-cyan-400" /> Sitemap
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <ExternalLink className="h-4 w-4 text-cyan-400" /> robots.txt
              </span>
            </div>
            {/* Estados */}
            <div className="flex items-center gap-3 pl-4 border-l border-white/20">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                <span className="text-emerald-400">OK</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400"></span>
                <span className="text-red-400">Falta</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-cyan-400"></span>
                <span className="text-cyan-400">Verificar</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

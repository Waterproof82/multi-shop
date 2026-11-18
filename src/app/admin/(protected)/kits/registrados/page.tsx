'use client';

// kit-expiry-reminders M4d — listado paginado de kits registrados
// (docs/sdd/kit-expiry-reminders/m4/, R-M4.5): email/telefono llegan
// enmascarados por defecto (DD12); «Ver contacto» revela el valor completo
// de UNA fila concreta via `GET registrados/[serie]/contacto`
// (Cache-Control: no-store, auditado en el servidor — R-M4.5.2/R-M4.5.3).

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import type { KitRegistradoListado, Paginado, ContactoKit } from '@/core/domain/entities/kit-caducidad-types';

const PAGE_SIZE = 50;

function withEmpresaId(url: string, overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}empresaId=${id}`;
}

export default function KitsRegistradosPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [registrados, setRegistrados] = useState<KitRegistradoListado[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contactos, setContactos] = useState<Record<string, ContactoKit>>({});
  const [revelando, setRevelando] = useState<string | null>(null);
  const [errorContacto, setErrorContacto] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = withEmpresaId(`/api/admin/kits/registrados?page=${page}&pageSize=${PAGE_SIZE}`, overrideEmpresaId, empresaId);
      const res = await fetch(url);
      if (!res.ok) throw new Error(t('kitsErrorCargarRegistrados', language));
      const data: Paginado<KitRegistradoListado> = await res.json();
      setRegistrados(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [page, empresaId, overrideEmpresaId, language]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleVerContacto(serie: string) {
    setRevelando(serie);
    setErrorContacto('');
    try {
      const url = withEmpresaId(`/api/admin/kits/registrados/${encodeURIComponent(serie)}/contacto`, overrideEmpresaId, empresaId);
      const res = await fetch(url);
      if (!res.ok) throw new Error(t('kitsErrorVerContacto', language));
      const contacto: ContactoKit = await res.json();
      setContactos((prev) => ({ ...prev, [serie]: contacto }));
    } catch (err) {
      setErrorContacto(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRevelando(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t('kitsRegistradosTitle', language)}</h1>
        <p className="text-slate-300 text-sm mt-1">{t('kitsRegistradosSubtitle', language)}</p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{error}</div>
      )}
      {errorContacto && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{errorContacto}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsSerie', language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsContactoEmail', language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsContactoTelefono', language)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsFechaRegistro', language)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('actions', language)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {registrados.map((r) => {
                  const contacto = contactos[r.serie];
                  return (
                    <tr key={r.serie} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-slate-200 font-mono">{r.serie}</td>
                      <td className="px-4 py-3 text-slate-200">{contacto?.email ?? r.emailMasked ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-200">{contacto?.telefono ?? r.telefonoMasked ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-200">{r.registradoAt ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {!contacto && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={revelando === r.serie}
                            onClick={() => { void handleVerContacto(r.serie); }}
                          >
                            {revelando === r.serie ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                            {t('kitsVerContacto', language)}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {registrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">{t('kitsSinRegistrados', language)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-white/10">
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                {t('stockAnterior', language)}
              </Button>
              <span className="text-sm text-slate-400">
                {t('auditLogPage', language)} {page} {t('auditLogOf', language)} {totalPages}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                {t('stockSiguiente', language)}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

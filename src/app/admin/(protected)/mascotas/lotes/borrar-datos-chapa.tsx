'use client';

// sdd pet-id-qr-profile, Fase 7 (admin UI, PR7) — R-QR.1.3: borrado auditado
// de los datos de una chapa, sobre `POST
// /api/admin/mascotas/chapas/{codigo}/borrar` (PR6, exige
// `requireRole(['admin','superadmin'])`). No depende de ningún lote: el
// código ya identifica la chapa.

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';

/** El código es obligatorio; la forma exacta ya la valida la ruta/BD. */
export function codigoBorrarValido(codigo: string): boolean {
  return codigo.trim().length > 0;
}

function withEmpresaId(url: string, overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}empresaId=${id}`;
}

export function BorrarDatosChapa() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [codigo, setCodigo] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleBorrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoBorrarValido(codigo)) return;
    setBorrando(true);
    setError('');
    setSuccess('');
    try {
      const url = withEmpresaId(`/api/admin/mascotas/chapas/${encodeURIComponent(codigo.trim())}/borrar`, overrideEmpresaId, empresaId);
      const res = await fetchWithCsrf(url, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('mascotasBorrarDatosError', language));
      }
      setSuccess(t('mascotasBorrarDatosOk', language));
      setCodigo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mascotasBorrarDatosError', language));
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">{t('mascotasBorrarDatosTitle', language)}</h2>
      </div>

      {error && (
        <div className="m-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{error}</div>
      )}
      {success && (
        <div className="m-4 p-3 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-md">{success}</div>
      )}

      <form onSubmit={handleBorrar} className="p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label htmlFor="mascotas-borrar-codigo" className="block text-sm font-medium text-slate-300 mb-1">{t('mascotasBorrarDatosCodigo', language)}</label>
          <Input id="mascotas-borrar-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={16} />
        </div>
        <Button type="submit" variant="outline" disabled={borrando || !codigoBorrarValido(codigo)}>
          {borrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {t('mascotasBorrarDatosBoton', language)}
        </Button>
      </form>
    </div>
  );
}

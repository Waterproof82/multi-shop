'use client';

// kit-expiry-reminders M4b2b — editor de caducidades de un lote, apilada
// sobre M4b2a (listado/alta) (docs/sdd/kit-expiry-reminders/m4/, R-M4.3.*,
// DD9 de design.md).

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage, type Language } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import type { ConsumibleKit, LineaCandidata } from '@/core/domain/entities/kit-caducidad-types';

export interface FilaCaducidadForm {
  ingredienteId: string;
  parte: string;
  albaranCompraItemId: string | null;
  caducaEl: string | null;
}

type TipoFuente = 'albaran' | 'manual';

// ── Reglas puras (R-M4.3.2/DD9 — mismo refine que replaceCaducidadesSchema) ──

/** Exactamente una fuente de fecha; la manual exige `parte` no vacía. */
export function filaTieneFuenteValida(row: FilaCaducidadForm): boolean {
  const tieneAlbaran = Boolean(row.albaranCompraItemId);
  const tieneManual = Boolean(row.caducaEl);
  if (tieneAlbaran === tieneManual) return false;
  if (tieneManual && row.parte.trim().length === 0) return false;
  return true;
}

export function hayParteDuplicada(rows: FilaCaducidadForm[]): boolean {
  const vistos = new Set<string>();
  for (const row of rows) {
    const clave = `${row.ingredienteId}::${row.parte}`;
    if (vistos.has(clave)) return true;
    vistos.add(clave);
  }
  return false;
}

export function formularioValido(rows: FilaCaducidadForm[]): boolean {
  if (rows.length === 0) return false;
  if (hayParteDuplicada(rows)) return false;
  return rows.every(filaTieneFuenteValida);
}

/** `caducaEl: ''` = «Fecha manual» elegida pero aún sin fecha: sigue siendo manual. */
export function tipoFuenteDe(row: FilaCaducidadForm): TipoFuente {
  return row.caducaEl === null ? 'albaran' : 'manual';
}

function withEmpresaId(url: string, overrideEmpresaId: string | undefined, empresaId: string | undefined): string {
  const id = overrideEmpresaId || empresaId;
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}empresaId=${id}`;
}

function filasIniciales(consumibles: ConsumibleKit[], existentes: FilaCaducidadForm[]): FilaCaducidadForm[] {
  const yaCubiertos = new Set(existentes.map((f) => f.ingredienteId));
  const vacias: FilaCaducidadForm[] = consumibles
    .filter((c) => c.esPerecedero && !yaCubiertos.has(c.ingredienteId))
    .map((c) => ({ ingredienteId: c.ingredienteId, parte: '', albaranCompraItemId: null, caducaEl: null }));
  return [...existentes, ...vacias];
}

interface EditorPayload {
  lote: { codigo: string };
  consumibles: ConsumibleKit[];
  caducidades: FilaCaducidadForm[];
}

interface FilaRowProps {
  row: FilaCaducidadForm;
  index: number;
  consumibles: ConsumibleKit[];
  lineasCandidatas: LineaCandidata[];
  partesUsadas: string[];
  language: Language;
  onChange: (index: number, next: FilaCaducidadForm) => void;
  onDelete: (index: number) => void;
}

function FilaRow({ row, index, consumibles, lineasCandidatas, partesUsadas, language, onChange, onDelete }: Readonly<FilaRowProps>) {
  const tipo = tipoFuenteDe(row);
  const candidatasDelIngrediente = lineasCandidatas.filter((l) => l.ingredienteId === row.ingredienteId);

  return (
    <tr className="hover:bg-white/5 transition-colors align-top">
      <td className="px-4 py-3">
        <select
          value={row.ingredienteId}
          onChange={(e) => onChange(index, { ...row, ingredienteId: e.target.value })}
          className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm"
          aria-label={`${t('kitsIngrediente', language)} ${index + 1}`}
        >
          {consumibles.filter((c) => c.esPerecedero).map((c) => (
            <option key={c.ingredienteId} value={c.ingredienteId}>{c.nombre}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <Input
          value={row.parte}
          onChange={(e) => onChange(index, { ...row, parte: e.target.value })}
          list="kits-partes-usadas"
          aria-label={`${t('kitsParte', language)} ${index + 1}`}
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={tipo}
          onChange={(e) => onChange(index, e.target.value === 'manual'
            ? { ...row, caducaEl: row.caducaEl ?? '', albaranCompraItemId: null }
            : { ...row, albaranCompraItemId: row.albaranCompraItemId ?? '', caducaEl: null })}
          className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm"
          aria-label={`${t('kitsFuenteAlbaran', language)}/${t('kitsFuenteManual', language)} ${index + 1}`}
        >
          <option value="albaran">{t('kitsFuenteAlbaran', language)}</option>
          <option value="manual">{t('kitsFuenteManual', language)}</option>
        </select>
      </td>
      <td className="px-4 py-3">
        {tipo === 'manual' ? (
          <Input
            type="date"
            value={row.caducaEl ?? ''}
            onChange={(e) => onChange(index, { ...row, caducaEl: e.target.value, albaranCompraItemId: null })}
            aria-label={`${t('kitsFechaCaducidad', language)} ${index + 1}`}
          />
        ) : (
          <select
            value={row.albaranCompraItemId ?? ''}
            onChange={(e) => onChange(index, { ...row, albaranCompraItemId: e.target.value || null, caducaEl: null })}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm"
            aria-label={`${t('kitsSeleccionarLinea', language)} ${index + 1}`}
          >
            <option value="">— {t('kitsSeleccionarLinea', language)} —</option>
            {candidatasDelIngrediente.map((l) => (
              <option key={l.albaranCompraItemId} value={l.albaranCompraItemId}>
                {l.numeroAlbaran} · {l.fechaCaducidad}{l.numeroLote ? ` · ${l.numeroLote}` : ''}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onDelete(index)}
          aria-label={`${t('delete', language)} ${index + 1}`}
          className="p-2 text-red-400 hover:text-red-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
      <datalist id="kits-partes-usadas">
        {partesUsadas.map((p) => <option key={p} value={p} />)}
      </datalist>
    </tr>
  );
}

interface LoteCaducidadesEditorProps {
  loteId: string;
  onSaved?: () => void;
}

export function LoteCaducidadesEditor({ loteId, onSaved }: Readonly<LoteCaducidadesEditorProps>) {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();

  const [codigo, setCodigo] = useState('');
  const [consumibles, setConsumibles] = useState<ConsumibleKit[]>([]);
  const [lineasCandidatas, setLineasCandidatas] = useState<LineaCandidata[]>([]);
  const [partesUsadas, setPartesUsadas] = useState<string[]>([]);
  const [rows, setRows] = useState<FilaCaducidadForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [editorRes, candidatasRes] = await Promise.all([
        fetch(withEmpresaId(`/api/admin/kits/lotes/${loteId}/caducidades`, overrideEmpresaId, empresaId)),
        fetch(withEmpresaId(`/api/admin/kits/candidatas?loteId=${loteId}`, overrideEmpresaId, empresaId)),
      ]);
      if (!editorRes.ok || !candidatasRes.ok) throw new Error(t('kitsErrorCargarEditor', language));
      const editor: EditorPayload = await editorRes.json();
      const candidatas: { lineas: LineaCandidata[]; partesUsadas: string[] } = await candidatasRes.json();
      setCodigo(editor.lote.codigo);
      setConsumibles(editor.consumibles);
      setLineasCandidatas(candidatas.lineas);
      setPartesUsadas(candidatas.partesUsadas);
      setRows(filasIniciales(editor.consumibles, editor.caducidades));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [loteId, empresaId, overrideEmpresaId, language]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleRowChange = (index: number, next: FilaCaducidadForm) => {
    setRows((prev) => prev.map((row, i) => (i === index ? next : row)));
  };

  const handleRowDelete = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddRow = () => {
    const primerPerecedero = consumibles.find((c) => c.esPerecedero);
    if (!primerPerecedero) return;
    setRows((prev) => [...prev, { ingredienteId: primerPerecedero.ingredienteId, parte: '', albaranCompraItemId: null, caducaEl: null }]);
  };

  const handleGuardar = async () => {
    if (!formularioValido(rows)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetchWithCsrf(withEmpresaId(`/api/admin/kits/lotes/${loteId}/caducidades`, overrideEmpresaId, empresaId), {
        method: 'PUT',
        body: JSON.stringify({ items: rows }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('kitsErrorGuardarCaducidades', language));
      }
      setSuccess(t('kitsCaducidadesGuardadas', language));
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">{t('kitsEditorTitle', language)} — {codigo}</h2>
      </div>

      {error && (
        <div className="m-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">{error}</div>
      )}
      {success && (
        <div className="m-4 p-3 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-md">{success}</div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsIngrediente', language)}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsParte', language)}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsFuenteAlbaran', language)}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('kitsFechaCaducidad', language)}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('actions', language)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row, index) => (
              <FilaRow
                key={`${row.ingredienteId}-${index}`}
                row={row}
                index={index}
                consumibles={consumibles}
                lineasCandidatas={lineasCandidatas}
                partesUsadas={partesUsadas}
                language={language}
                onChange={handleRowChange}
                onDelete={handleRowDelete}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">{t('kitsSinIngredientesPerecederos', language)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-3">
        <Button type="button" variant="outline" onClick={handleAddRow} disabled={!consumibles.some((c) => c.esPerecedero)}>
          <Plus className="h-4 w-4" />
          {t('kitsAnadirFila', language)}
        </Button>
        <Button type="button" onClick={handleGuardar} disabled={saving || !formularioValido(rows)}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('savingProgress', language)}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {t('save', language)}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

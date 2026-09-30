'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import type { EmpresaLegal, LegalContext } from '@/core/domain/entities/empresa-legal';
import { SUPUESTOS_ART_103, type CodigoArt103 } from '@/core/domain/legal/constantes';
import { updateEmpresaLegalSchema } from '@/core/application/dtos/empresa-legal.dto';
import { aplicaPagina, type FlagsPaginas } from '@/lib/legal/paginas-legales';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { GarantiasEditor } from './GarantiasEditor';

type Lang = Parameters<typeof t>[1];
type Pestana = 'aviso' | 'condiciones' | 'envios' | 'devoluciones';

const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 min-h-[44px] text-sm text-white';

const PESTANAS: readonly { id: Pestana; labelKey: Parameters<typeof t>[0]; href: string; slug: Parameters<typeof aplicaPagina>[1] }[] = [
  { id: 'aviso', labelKey: 'legalTabAviso', href: '/aviso-legal', slug: 'aviso-legal' },
  { id: 'condiciones', labelKey: 'legalTabCondiciones', href: '/condiciones', slug: 'condiciones' },
  { id: 'envios', labelKey: 'legalTabEnvios', href: '/envios-y-pagos', slug: 'envios-y-pagos' },
  { id: 'devoluciones', labelKey: 'legalTabDevoluciones', href: '/devoluciones', slug: 'devoluciones' },
];

interface Props {
  inicial: EmpresaLegal;
  titular: LegalContext['titular'];
  flags: FlagsPaginas;
}

/** Los inputs trabajan con string; null ↔ ''. */
function aTexto(v: string | null): string {
  return v ?? '';
}

function aNumeroONull(v: string): number | null {
  return v === '' ? null : Number(v);
}

function Campo({ label, ayuda, children, htmlFor }: Readonly<{ label: string; ayuda?: string; htmlFor: string; children: ReactNode }>) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-white">{label}</label>
      {children}
      {ayuda && <p className="text-xs text-slate-400">{ayuda}</p>}
    </div>
  );
}

function DatosEmpresa({ titular, language }: Readonly<{ titular: LegalContext['titular']; language: Lang }>) {
  const filas = [titular.nombre, titular.nif, titular.direccion, titular.email].filter((v): v is string => Boolean(v));
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-white">{t('legalDatosEmpresa', language)}</h3>
      <ul className="text-sm text-slate-300 space-y-0.5">{filas.map((f) => <li key={f}>{f}</li>)}</ul>
      <p className="text-xs text-slate-400">
        {t('legalDatosEmpresaAyuda', language)}{' '}
        <Link href="/admin/configuracion" className="underline">{t('legalIrConfiguracion', language)}</Link>
      </p>
    </section>
  );
}

function TextoAdicionalInput({ id, valor, onChange, language }: Readonly<{ id: string; valor: string | null; onChange: (v: string | null) => void; language: Lang }>) {
  return (
    <Campo htmlFor={id} label={t('legalAdicional', language)} ayuda={t('legalAdicionalAyuda', language)}>
      <textarea id={id} className={`${inputClass} min-h-[120px]`} maxLength={2000} value={aTexto(valor)}
        onChange={(e) => onChange(e.target.value)} />
    </Campo>
  );
}

interface PanelProps {
  id: string;
  datos: EmpresaLegal;
  set: <K extends keyof EmpresaLegal>(k: K, v: EmpresaLegal[K]) => void;
  language: Lang;
}

function PanelAviso({ id, datos, set, language }: Readonly<PanelProps>) {
  return (
    <>
      <Campo htmlFor={`${id}-rm`} label={t('legalRegistroMercantil', language)} ayuda={t('legalRegistroMercantilAyuda', language)}>
        <input id={`${id}-rm`} className={inputClass} maxLength={300} value={aTexto(datos.registroMercantil)}
          onChange={(e) => set('registroMercantil', e.target.value)} />
      </Campo>
      <Campo htmlFor={`${id}-email`} label={t('legalEmailLegal', language)} ayuda={t('legalEmailLegalAyuda', language)}>
        <input id={`${id}-email`} type="email" className={inputClass} maxLength={200} value={aTexto(datos.emailLegal)}
          onChange={(e) => set('emailLegal', e.target.value)} />
      </Campo>
      <TextoAdicionalInput id={`${id}-ad-aviso`} valor={datos.adicionalAvisoLegal} onChange={(v) => set('adicionalAvisoLegal', v)} language={language} />
    </>
  );
}

function PanelEnvios({ id, datos, set, language }: Readonly<PanelProps>) {
  return (
    <>
      <Campo htmlFor={`${id}-prep`} label={t('legalPlazoPreparacion', language)}>
        <input id={`${id}-prep`} type="number" min={0} max={60} className={inputClass} value={datos.plazoPreparacionDias ?? ''}
          onChange={(e) => set('plazoPreparacionDias', aNumeroONull(e.target.value))} />
      </Campo>
      <Campo htmlFor={`${id}-danos`} label={t('legalPlazoAvisoDanos', language)}>
        <input id={`${id}-danos`} type="number" min={1} max={720} className={inputClass} value={datos.plazoAvisoDanosHoras ?? ''}
          onChange={(e) => set('plazoAvisoDanosHoras', aNumeroONull(e.target.value))} />
      </Campo>
      <TextoAdicionalInput id={`${id}-ad-env`} valor={datos.adicionalEnvios} onChange={(v) => set('adicionalEnvios', v)} language={language} />
    </>
  );
}

interface PanelDevolucionesProps extends PanelProps {
  toggleSupuesto: (codigo: CodigoArt103) => void;
}

function PanelDevoluciones({ id, datos, set, language, toggleSupuesto }: Readonly<PanelDevolucionesProps>) {
  return (
    <>
      <Campo htmlFor={`${id}-plazo`} label={t('legalPlazoDesistimiento', language)} ayuda={t('legalPlazoDesistimientoAyuda', language)}>
        <input id={`${id}-plazo`} type="number" min={14} max={365} className={inputClass} value={datos.plazoDesistimientoDias}
          onChange={(e) => set('plazoDesistimientoDias', Number(e.target.value))} />
      </Campo>
      <Campo htmlFor={`${id}-gastos`} label={t('legalGastosDevolucion', language)}>
        <select id={`${id}-gastos`} className={inputClass} value={datos.gastosDevolucion}
          onChange={(e) => set('gastosDevolucion', e.target.value === 'empresa' ? 'empresa' : 'cliente')}>
          <option value="cliente">{t('legalGastosCliente', language)}</option>
          <option value="empresa">{t('legalGastosEmpresa', language)}</option>
        </select>
      </Campo>
      <Campo htmlFor={`${id}-dir`} label={t('legalDireccionDevoluciones', language)} ayuda={t('legalDireccionDevolucionesAyuda', language)}>
        <input id={`${id}-dir`} className={inputClass} maxLength={300} value={aTexto(datos.direccionDevoluciones)}
          onChange={(e) => set('direccionDevoluciones', e.target.value)} />
      </Campo>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-white">{t('legalExclusiones', language)}</legend>
        <p className="text-xs text-slate-400">{t('legalExclusionesAyuda', language)}</p>
        {SUPUESTOS_ART_103.map((s) => (
          <label key={s.codigo} className="flex items-start gap-2 min-h-[44px] text-sm text-slate-300">
            <input type="checkbox" className="mt-1" checked={datos.exclusionesDesistimiento.supuestos.includes(s.codigo)}
              onChange={() => toggleSupuesto(s.codigo)} />
            <span>{s.etiqueta} (art. 103.{s.letra})</span>
          </label>
        ))}
        <Campo htmlFor={`${id}-otras`} label={t('legalExclusionesOtras', language)}>
          <textarea id={`${id}-otras`} className={inputClass} maxLength={500} value={aTexto(datos.exclusionesDesistimiento.otras)}
            onChange={(e) => set('exclusionesDesistimiento', { ...datos.exclusionesDesistimiento, otras: e.target.value })} />
        </Campo>
      </fieldset>
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-white">{t('legalGarantias', language)}</h3>
        <GarantiasEditor filas={datos.garantias} onChange={(g) => set('garantias', g)} />
      </section>
      <TextoAdicionalInput id={`${id}-ad-dev`} valor={datos.adicionalDevoluciones} onChange={(v) => set('adicionalDevoluciones', v)} language={language} />
    </>
  );
}

export function LegalSettingsForm({ inicial, titular, flags }: Readonly<Props>) {
  const { language } = useLanguage();
  const id = useId();
  const pestanas = PESTANAS.filter((p) => aplicaPagina(flags, p.slug));
  const [activa, setActiva] = useState<Pestana>('aviso');
  const [datos, setDatos] = useState<EmpresaLegal>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const set = <K extends keyof EmpresaLegal>(k: K, v: EmpresaLegal[K]) => setDatos((d) => ({ ...d, [k]: v }));

  const toggleSupuesto = (codigo: CodigoArt103) => {
    const actuales = datos.exclusionesDesistimiento.supuestos;
    const supuestos = actuales.includes(codigo) ? actuales.filter((c) => c !== codigo) : [...actuales, codigo];
    set('exclusionesDesistimiento', { ...datos.exclusionesDesistimiento, supuestos });
  };

  async function guardar() {
    setError(null);
    setOk(false);
    const parsed = updateEmpresaLegalSchema.safeParse(datos);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setGuardando(true);
    try {
      const res = await fetchWithCsrf('/api/admin/legal', { method: 'PUT', body: JSON.stringify(parsed.data) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t('errorSaving', language));
        return;
      }
      setOk(true);
    } catch {
      setError(t('connectionError', language));
    } finally {
      setGuardando(false);
    }
  }

  const pestanaActual = pestanas.find((p) => p.id === activa) ?? pestanas[0];

  return (
    <div className="space-y-6">
      <DatosEmpresa titular={titular} language={language} />

      <div role="tablist" aria-label={t('legalAdminTitle', language)} className="flex flex-wrap gap-2 border-b border-white/10">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" id={`${id}-tab-${p.id}`} aria-selected={p.id === pestanaActual.id}
            aria-controls={`${id}-panel`} onClick={() => setActiva(p.id)}
            className="min-h-[44px] px-3 text-sm text-slate-300 aria-selected:text-white aria-selected:border-b-2 aria-selected:border-cyan-400">
            {t(p.labelKey, language)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${pestanaActual.id}`} className="space-y-5">
        {pestanaActual.id === 'aviso' && <PanelAviso id={id} datos={datos} set={set} language={language} />}
        {pestanaActual.id === 'condiciones' && (
          <TextoAdicionalInput id={`${id}-ad-cond`} valor={datos.adicionalCondiciones} onChange={(v) => set('adicionalCondiciones', v)} language={language} />
        )}
        {pestanaActual.id === 'envios' && <PanelEnvios id={id} datos={datos} set={set} language={language} />}
        {pestanaActual.id === 'devoluciones' && (
          <PanelDevoluciones id={id} datos={datos} set={set} language={language} toggleSupuesto={toggleSupuesto} />
        )}
      </div>

      {error !== null && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {ok && <p role="status" className="text-sm text-emerald-300">{t('legalGuardado', language)}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={guardar} disabled={guardando}
          className="min-h-[44px] rounded-md bg-cyan-500 px-4 text-sm font-semibold text-slate-900 disabled:opacity-50">
          {t('legalGuardar', language)}
        </button>
        <a href={pestanaActual.href} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center rounded-md border border-white/10 px-4 text-sm text-white">
          {t('legalVerPagina', language)}
        </a>
      </div>
    </div>
  );
}

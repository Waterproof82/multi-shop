'use client';

import { useCallback, useState } from 'react';
import { PillSwitch } from '@/components/ui/pill-switch';
import { ModalidadesEntregaForm, type ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface TiendaDeliverySettingsProps {
  empresaId: string;
  recogidaHabilitada: boolean;
  envioHabilitado: boolean;
  modalidadesIniciales: ModalidadEntregaRow[];
}

type CampoHabilitado = 'recogida_tienda_habilitada' | 'envio_domicilio_habilitado';

interface CreateModalidadInput {
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre_es: string;
  precioCents: number;
  tiempoMinMinutos?: number;
  tiempoMaxMinutos?: number;
}

type Lang = Parameters<typeof t>[1];

interface ErrorPayload {
  error?: string;
}

async function extraerMensajeError(res: Response, language: Lang): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as ErrorPayload;
  return data.error ?? t('errorSaving', language);
}

function agregarCampo(prev: Set<CampoHabilitado>, campo: CampoHabilitado): Set<CampoHabilitado> {
  const next = new Set(prev);
  next.add(campo);
  return next;
}

function quitarCampo(prev: Set<CampoHabilitado>, campo: CampoHabilitado): Set<CampoHabilitado> {
  const next = new Set(prev);
  next.delete(campo);
  return next;
}

export function TiendaDeliverySettings({
  empresaId,
  recogidaHabilitada: recogidaInicial,
  envioHabilitado: envioInicial,
  modalidadesIniciales,
}: Readonly<TiendaDeliverySettingsProps>) {
  const { language } = useLanguage();
  const [recogidaHabilitada, setRecogidaHabilitada] = useState(recogidaInicial);
  const [envioHabilitado, setEnvioHabilitado] = useState(envioInicial);
  const [savingCampos, setSavingCampos] = useState<Set<CampoHabilitado>>(new Set());
  const [modalidades, setModalidades] = useState<ModalidadEntregaRow[]>(modalidadesIniciales);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const toggleHabilitado = useCallback(
    async (campo: CampoHabilitado, valorActual: boolean, setValor: (v: boolean) => void) => {
      const nuevoValor = !valorActual;
      setValor(nuevoValor);
      setSavingCampos((prev) => agregarCampo(prev, campo));
      setFeedback(null);
      try {
        const res = await fetchWithCsrf('/api/admin/empresa', {
          method: 'PUT',
          body: JSON.stringify({ [campo]: nuevoValor }),
        });
        if (!res.ok) {
          setValor(valorActual);
          setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
        }
      } catch {
        setValor(valorActual);
        setFeedback({ ok: false, message: t('connectionError', language) });
      } finally {
        setSavingCampos((prev) => quitarCampo(prev, campo));
      }
    },
    [language]
  );

  const handleCreate = useCallback(
    async (data: CreateModalidadInput) => {
      setFeedback(null);
      try {
        const res = await fetchWithCsrf('/api/admin/modalidades-entrega', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
          return;
        }
        const creada = (await res.json()) as ModalidadEntregaRow;
        setModalidades((prev) => [...prev, creada]);
      } catch {
        setFeedback({ ok: false, message: t('connectionError', language) });
      }
    },
    [language]
  );

  const handleUpdate = useCallback(
    async (id: string, data: Partial<ModalidadEntregaRow>) => {
      setFeedback(null);
      try {
        const res = await fetchWithCsrf(`/api/admin/modalidades-entrega?id=${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
          return;
        }
        const actualizada = (await res.json()) as ModalidadEntregaRow;
        setModalidades((prev) => prev.map((m) => (m.id === id ? actualizada : m)));
      } catch {
        setFeedback({ ok: false, message: t('connectionError', language) });
      }
    },
    [language]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setFeedback(null);
      try {
        const res = await fetchWithCsrf(`/api/admin/modalidades-entrega?id=${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
          return;
        }
        setModalidades((prev) => prev.filter((m) => m.id !== id));
      } catch {
        setFeedback({ ok: false, message: t('connectionError', language) });
      }
    },
    [language]
  );

  return (
    <div className="space-y-10" data-empresa-id={empresaId}>
      <section>
        <h2 className="text-2xl font-bold text-white mb-6">{t('deliveryMethodTitle', language)}</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-foreground">{t('tiendaRecogidaLabel', language)}</span>
            <PillSwitch
              checked={recogidaHabilitada}
              disabled={savingCampos.has('recogida_tienda_habilitada')}
              onChange={() =>
                toggleHabilitado('recogida_tienda_habilitada', recogidaHabilitada, setRecogidaHabilitada)
              }
              ariaLabel={t('tiendaRecogidaLabel', language)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-foreground">{t('tiendaEnvioLabel', language)}</span>
            <PillSwitch
              checked={envioHabilitado}
              disabled={savingCampos.has('envio_domicilio_habilitado')}
              onChange={() =>
                toggleHabilitado('envio_domicilio_habilitado', envioHabilitado, setEnvioHabilitado)
              }
              ariaLabel={t('tiendaEnvioLabel', language)}
            />
          </div>
        </div>
      </section>

      {feedback && (
        <p
          role={feedback.ok ? 'status' : 'alert'}
          className={`text-sm ${feedback.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
        >
          {feedback.message}
        </p>
      )}

      {recogidaHabilitada && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            {t('tiendaRecogidaLabel', language)}
          </h3>
          <ModalidadesEntregaForm
            tipo="recogida"
            modalidades={modalidades}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </section>
      )}

      {envioHabilitado && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            {t('tiendaEnvioLabel', language)}
          </h3>
          <ModalidadesEntregaForm
            tipo="domicilio"
            modalidades={modalidades}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </section>
      )}
    </div>
  );
}

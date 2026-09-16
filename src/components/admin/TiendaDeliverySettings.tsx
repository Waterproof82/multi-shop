'use client';

import { useCallback, useState } from 'react';
import { PillSwitch } from '@/components/ui/pill-switch';
import { ModalidadesEntregaForm, type ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface TiendaDeliverySettingsProps {
  empresaId: string;
  envioHabilitado: boolean;
  modalidadesIniciales: ModalidadEntregaRow[];
}

interface CreateModalidadInput {
  tipo: 'domicilio';
  icono: string;
  nombre_es: string;
  precioCents: number;
  tiempoMinMinutos: number;
  tiempoMaxMinutos: number;
}

type Lang = Parameters<typeof t>[1];

interface ErrorPayload {
  error?: string;
}

async function extraerMensajeError(res: Response, language: Lang): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as ErrorPayload;
  return data.error ?? t('errorSaving', language);
}

export function TiendaDeliverySettings({
  empresaId,
  envioHabilitado: envioInicial,
  modalidadesIniciales,
}: Readonly<TiendaDeliverySettingsProps>) {
  const { language } = useLanguage();
  const [envioHabilitado, setEnvioHabilitado] = useState(envioInicial);
  const [savingEnvio, setSavingEnvio] = useState(false);
  const [modalidades, setModalidades] = useState<ModalidadEntregaRow[]>(modalidadesIniciales);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const toggleEnvio = useCallback(async () => {
    const nuevoValor = !envioHabilitado;
    setEnvioHabilitado(nuevoValor);
    setSavingEnvio(true);
    setFeedback(null);
    try {
      const res = await fetchWithCsrf('/api/admin/empresa', {
        method: 'PUT',
        body: JSON.stringify({ envio_domicilio_habilitado: nuevoValor }),
      });
      if (!res.ok) {
        setEnvioHabilitado(!nuevoValor);
        setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
      }
    } catch {
      setEnvioHabilitado(!nuevoValor);
      setFeedback({ ok: false, message: t('connectionError', language) });
    } finally {
      setSavingEnvio(false);
    }
  }, [envioHabilitado, language]);

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
            <span className="text-sm font-medium text-white">{t('tiendaEnvioLabel', language)}</span>
            <PillSwitch
              checked={envioHabilitado}
              disabled={savingEnvio}
              onChange={toggleEnvio}
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

      {envioHabilitado && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            {t('tiendaEnvioLabel', language)}
          </h3>
          <ModalidadesEntregaForm
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

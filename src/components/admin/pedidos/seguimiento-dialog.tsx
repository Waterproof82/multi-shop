'use client';

import { useCallback, useState } from 'react';
import { Mail, Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { t } from '@/lib/translations';
import type { Language } from '@/lib/language-context';
import { NUMERO_SEGUIMIENTO_MAX } from '@/core/domain/constants/pedido';

export interface PedidoSeguimiento {
  id: string;
  numero_pedido: number;
  numero_seguimiento?: string | null;
  clientes: { email: string | null } | null;
}

interface VistaPrevia {
  subject: string;
  html: string;
  destinatario: string;
}

type Paso = 'numero' | 'confirmar' | 'sin-email';

interface Props {
  pedido: PedidoSeguimiento | null;
  empresaId: string;
  language: Language;
  onClose: () => void;
  onSaved: (id: string, numeroSeguimiento: string | null) => void;
  onEmailSent: (id: string, enviadoAt: string) => void;
}

const BTN_SECUNDARIO = 'px-4 py-2 min-h-[44px] text-muted-foreground hover:bg-muted rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50';
const BTN_PRIMARIO = 'inline-flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

function urlSeguimiento(pedidoId: string, empresaId: string): string {
  return `/api/admin/pedidos/${pedidoId}/seguimiento?empresaId=${empresaId}`;
}

/** Tras guardar: con número y email se confirma el envío; sin email solo se avisa. */
function pasoTrasGuardar(numero: string | null, email: string | null | undefined): Paso | null {
  if (numero === null) return null;
  return email ? 'confirmar' : 'sin-email';
}

export function SeguimientoDialog({ pedido, empresaId, language, onClose, onSaved, onEmailSent }: Readonly<Props>) {
  const [paso, setPaso] = useState<Paso>('numero');
  // El padre monta el diálogo con `key={pedido.id}`: el estado nace limpio por pedido.
  const [numero, setNumero] = useState(pedido?.numero_seguimiento ?? '');
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<VistaPrevia | null>(null);

  const cargarVistaPrevia = useCallback(async (id: string) => {
    try {
      const res = await fetchWithCsrf(urlSeguimiento(id, empresaId));
      if (!res.ok) {
        setError(t('trackingEmailError', language));
        return;
      }
      setVistaPrevia(await res.json() as VistaPrevia);
    } catch (e) {
      logClientError(e, 'cargarVistaPreviaSeguimiento');
      setError(t('trackingEmailError', language));
    }
  }, [empresaId, language]);

  const guardar = async () => {
    if (!pedido) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetchWithCsrf(urlSeguimiento(pedido.id, empresaId), {
        method: 'PUT',
        body: JSON.stringify({ numeroSeguimiento: numero }),
      });
      if (!res.ok) {
        setError(t('trackingNumberSaveError', language));
        return;
      }
      const { numeroSeguimiento } = await res.json() as { numeroSeguimiento: string | null };
      onSaved(pedido.id, numeroSeguimiento);
      const siguiente = pasoTrasGuardar(numeroSeguimiento, pedido.clientes?.email);
      if (siguiente === null) {
        onClose();
        return;
      }
      setPaso(siguiente);
      if (siguiente === 'confirmar') void cargarVistaPrevia(pedido.id);
    } catch (e) {
      logClientError(e, 'guardarNumeroSeguimiento');
      setError(t('trackingNumberSaveError', language));
    } finally {
      setGuardando(false);
    }
  };

  const enviarEmail = async () => {
    if (!pedido) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetchWithCsrf(urlSeguimiento(pedido.id, empresaId), { method: 'POST' });
      if (!res.ok) {
        setError(t('trackingEmailError', language));
        return;
      }
      const { enviadoAt } = await res.json() as { enviadoAt: string };
      onEmailSent(pedido.id, enviadoAt);
      onClose();
    } catch (e) {
      logClientError(e, 'enviarEmailSeguimiento');
      setError(t('trackingEmailError', language));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={pedido !== null} onOpenChange={(open) => { if (!open && !enviando) onClose(); }}>
      <DialogContent className={paso === 'confirmar' ? 'sm:max-w-2xl' : 'sm:max-w-md'}>
        {paso === 'numero' && (
          <PasoNumero
            numeroPedido={pedido?.numero_pedido ?? null}
            numero={numero}
            guardando={guardando}
            language={language}
            onChange={setNumero}
            onCancel={onClose}
            onSubmit={guardar}
          />
        )}
        {paso === 'confirmar' && (
          <PasoConfirmar
            vistaPrevia={vistaPrevia}
            enviando={enviando}
            language={language}
            onSkip={onClose}
            onSend={enviarEmail}
          />
        )}
        {paso === 'sin-email' && (
          <PasoSinEmail language={language} onClose={onClose} />
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PasoNumero({
  numeroPedido,
  numero,
  guardando,
  language,
  onChange,
  onCancel,
  onSubmit,
}: Readonly<{
  numeroPedido: number | null;
  numero: string;
  guardando: boolean;
  language: Language;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}>) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <span className="p-2 bg-primary/10 rounded-full">
            <Truck className="w-5 h-5 text-primary" />
          </span>
          {t('trackingNumberTitle', language)} <span className="text-muted-foreground">#{numeroPedido}</span>
        </DialogTitle>
        <DialogDescription>{t('trackingNumberHint', language)}</DialogDescription>
      </DialogHeader>
      <div>
        <label htmlFor="numero-seguimiento" className="sr-only">{t('trackingNumberAction', language)}</label>
        <Input
          id="numero-seguimiento"
          value={numero}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('trackingNumberPlaceholder', language)}
          maxLength={NUMERO_SEGUIMIENTO_MAX}
          autoComplete="off"
          autoFocus
          className="w-full"
        />
      </div>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} disabled={guardando} className={BTN_SECUNDARIO}>
          {t('cancel', language)}
        </button>
        <button type="submit" disabled={guardando} className={BTN_PRIMARIO}>
          {guardando ? t('trackingNumberSaving', language) : t('trackingNumberSave', language)}
        </button>
      </div>
    </form>
  );
}

function PasoConfirmar({
  vistaPrevia,
  enviando,
  language,
  onSkip,
  onSend,
}: Readonly<{
  vistaPrevia: VistaPrevia | null;
  enviando: boolean;
  language: Language;
  onSkip: () => void;
  onSend: () => void;
}>) {
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <span className="p-2 bg-primary/10 rounded-full">
            <Mail className="w-5 h-5 text-primary" />
          </span>
          {t('trackingEmailConfirmTitle', language)}
        </DialogTitle>
        <DialogDescription>
          {t('trackingEmailConfirmDesc', language)}{' '}
          <strong className="text-foreground break-all">{vistaPrevia?.destinatario ?? '…'}</strong>
        </DialogDescription>
      </DialogHeader>
      {vistaPrevia === null ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">{t('trackingEmailLoadingPreview', language)}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{vistaPrevia.subject}</p>
          {/* sandbox vacío: el HTML del email no ejecuta scripts ni navega */}
          <iframe
            title={t('trackingEmailPreviewTitle', language)}
            sandbox=""
            srcDoc={vistaPrevia.html}
            className="w-full h-[50vh] rounded-lg border border-border bg-white"
          />
        </div>
      )}
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onSkip} disabled={enviando} className={BTN_SECUNDARIO}>
          {t('trackingEmailSkip', language)}
        </button>
        <button type="button" onClick={onSend} disabled={enviando || vistaPrevia === null} className={BTN_PRIMARIO}>
          <Mail className="w-4 h-4" />
          {enviando ? t('trackingEmailSending', language) : t('trackingEmailSend', language)}
        </button>
      </div>
    </div>
  );
}

function PasoSinEmail({ language, onClose }: Readonly<{ language: Language; onClose: () => void }>) {
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t('trackingNumberTitle', language)}</DialogTitle>
        <DialogDescription>{t('trackingEmailNoEmail', language)}</DialogDescription>
      </DialogHeader>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={BTN_PRIMARIO}>{t('accept', language)}</button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { fetchWithCsrf } from '@/lib/csrf-client';
import type { DeliverySettings } from '@/core/application/use-cases/delivery/getDeliverySettingsUseCase';

interface Props {
  initial: DeliverySettings;
  isSuperAdmin: boolean;
}

interface FieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  textarea?: boolean;
  secret?: boolean;
  isSet?: boolean;
}

function Field({ label, id, value, onChange, placeholder, hint, textarea, secret, isSet }: Readonly<FieldProps>) {
  const [show, setShow] = useState(false);

  const inputClass =
    'min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground';

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {isSet && !value && (
          <span className="ml-2 text-xs text-green-500 font-normal">✓ guardado</span>
        )}
      </label>
      {textarea ? (
        <textarea
          id={id}
          rows={5}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isSet ? '(dejar vacío para mantener el existente)' : placeholder}
          className={`${inputClass} resize-y font-mono text-xs`}
        />
      ) : secret ? (
        <div className="relative">
          <input
            id={id}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={isSet ? '(dejar vacío para mantener el existente)' : placeholder}
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={show ? 'Ocultar' : 'Mostrar'}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DeliveryCredentialsForm({ initial, isSuperAdmin }: Readonly<Props>) {
  const { language } = useLanguage();

  // Delivery config
  const [minOrderEuros, setMinOrderEuros] = useState(
    initial.delivery_min_order_cents > 0 ? String(initial.delivery_min_order_cents / 100) : ''
  );
  const [surchargeEuros, setSurchargeEuros] = useState(
    initial.delivery_fee_surcharge_cents > 0 ? String(initial.delivery_fee_surcharge_cents / 100) : ''
  );

  // Glovo
  const [glovoClientId, setGlovoClientId] = useState(initial.glovo_client_id);
  const [glovoKeyId, setGlovoKeyId] = useState(initial.glovo_key_id);
  const [glovoVendorId, setGlovoVendorId] = useState(initial.glovo_vendor_id);
  const [glovoCountry, setGlovoCountry] = useState(initial.glovo_country_code || 'es');
  const [glovoPrivateKey, setGlovoPrivateKey] = useState('');

  // Redsys
  const [redsysMerchantCode, setRedsysMerchantCode] = useState(initial.redsys_merchant_code);
  const [redsysTerminal, setRedsysTerminal] = useState(initial.redsys_terminal || '001');
  const [redsysSecretKey, setRedsysSecretKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    const payload: Record<string, unknown> = {
      delivery_min_order_cents: minOrderEuros ? Math.round(parseFloat(minOrderEuros) * 100) : 0,
      delivery_fee_surcharge_cents: surchargeEuros ? Math.round(parseFloat(surchargeEuros) * 100) : 0,
      glovo_client_id: glovoClientId,
      glovo_key_id: glovoKeyId,
      glovo_vendor_id: glovoVendorId,
      glovo_country_code: glovoCountry,
      redsys_merchant_code: redsysMerchantCode,
      redsys_terminal: redsysTerminal,
    };

    // Only include secrets when non-empty
    if (glovoPrivateKey.trim()) payload['glovo_private_key'] = glovoPrivateKey.trim();
    if (redsysSecretKey.trim()) payload['redsys_secret_key'] = redsysSecretKey.trim();

    try {
      const res = await fetchWithCsrf('/api/admin/delivery-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setFeedback({ ok: true, message: t('contactDataSaved', language) });
        // Clear secret fields after save
        setGlovoPrivateKey('');
        setRedsysSecretKey('');
      } else {
        const data = await res.json() as { error?: string };
        setFeedback({ ok: false, message: data.error ?? t('errorSaving', language) });
      }
    } catch {
      setFeedback({ ok: false, message: t('connectionError', language) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Delivery config */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Configuración general
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Pedido mínimo (€)"
            id="min-order"
            value={minOrderEuros}
            onChange={setMinOrderEuros}
            placeholder="0"
            hint="Dejar en 0 para sin mínimo"
          />
          <Field
            label="Recargo de envío adicional (€)"
            id="surcharge"
            value={surchargeEuros}
            onChange={setSurchargeEuros}
            placeholder="0"
            hint="Se suma a la tarifa de Glovo"
          />
        </div>
      </section>

      {/* Glovo + Redsys credentials — superadmin only */}
      {isSuperAdmin && (
        <>
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Glovo Business (LaaS)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Client ID"
                id="glovo-client-id"
                value={glovoClientId}
                onChange={setGlovoClientId}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <Field
                label="Key ID"
                id="glovo-key-id"
                value={glovoKeyId}
                onChange={setGlovoKeyId}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <Field
                label="Vendor ID"
                id="glovo-vendor-id"
                value={glovoVendorId}
                onChange={setGlovoVendorId}
                placeholder="outlet-slug"
              />
              <Field
                label="País"
                id="glovo-country"
                value={glovoCountry}
                onChange={setGlovoCountry}
                placeholder="es"
                hint="Código ISO de 2 letras: es, pt, fr..."
              />
            </div>
            <Field
              label="Clave privada RSA (PEM)"
              id="glovo-private-key"
              value={glovoPrivateKey}
              onChange={setGlovoPrivateKey}
              placeholder="-----BEGIN RSA PRIVATE KEY-----"
              hint="Solo pegá si querés reemplazar la existente."
              textarea
              isSet={initial.glovo_private_key_set}
            />
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Redsys TPV Virtual
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Código de comercio"
                id="redsys-merchant-code"
                value={redsysMerchantCode}
                onChange={setRedsysMerchantCode}
                placeholder="999008881"
              />
              <Field
                label="Terminal"
                id="redsys-terminal"
                value={redsysTerminal}
                onChange={setRedsysTerminal}
                placeholder="001"
              />
            </div>
            <Field
              label="Clave secreta (Base64)"
              id="redsys-secret-key"
              value={redsysSecretKey}
              onChange={setRedsysSecretKey}
              placeholder="sq7HjrUOBfKmC576ILgskD5srU870gJ7"
              hint="Solo pegá si querés reemplazar la existente."
              secret
              isSet={initial.redsys_secret_key_set}
            />
          </section>
        </>
      )}

      {feedback && (
        <p
          role={feedback.ok ? 'status' : 'alert'}
          className={`text-sm ${feedback.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
        >
          {feedback.message}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="min-h-[44px] px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? t('savingProgress', language) : t('deliveryZoneSave', language)}
      </button>
    </div>
  );
}

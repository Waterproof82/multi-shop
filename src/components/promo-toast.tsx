'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

export function PromoToast() {
  const { language } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const promoStatus = params.get('promo');
    const error = params.get('error');

    if (!promoStatus && !error) return;

    if (promoStatus === 'on') {
      setMessage('¡Te has dado de alta en las promociones!');
      setType('success');
      setVisible(true);
    } else if (promoStatus === 'off') {
      setMessage('¡Te has dado de baja en las promociones!');
      setType('success');
      setVisible(true);
    } else if (error === 'notfound') {
      setMessage('No se encontró tu cuenta. Contacta con la empresa.');
      setType('error');
      setVisible(true);
    } else if (error === 'invalid') {
      setMessage('Enlace inválido.');
      setType('error');
      setVisible(true);
    } else if (error === 'internal') {
      setMessage('Error interno. Intenta de nuevo.');
      setType('error');
      setVisible(true);
    }
  }, []);

  const handleClose = () => {
    setVisible(false);
    const url = new URL(globalThis.location.href);
    url.search = '';
    globalThis.history.replaceState({}, '', url.toString());
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-overlay cursor-default"
        onClick={handleClose}
        aria-label={t("close", language)}
      />

      <div className="relative bg-card text-card-foreground rounded-lg shadow-elegant-lg max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t("close", language)}
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="text-center">
          {type === 'success' ? (
            <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          ) : (
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          )}

          <h3 className="text-lg font-semibold text-foreground mb-2">
            {type === 'success' ? '¡Listo!' : 'Error'}
          </h3>

          <p className="text-muted-foreground">
            {message}
          </p>

          <button
            type="button"
            onClick={handleClose}
            className="mt-6 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("accept", language)}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

export type QRGateState = 'NO_TOKEN' | 'TOKEN_EXPIRED' | 'SESSION_CLOSED';

interface QRScannerGateProps {
  mesaId: string;
  state: QRGateState;
  onTokenIssued: (token: string, expiresAt: string) => void;
}

export function QRScannerGate({ mesaId, state, onTokenIssued }: QRScannerGateProps) {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // Ref so the zxing callback can schedule a retry without self-reference TDZ
  const startScannerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const title =
    state === 'NO_TOKEN'
      ? t('qrScannerNoToken', lang)
      : state === 'TOKEN_EXPIRED'
        ? t('qrScannerExpired', lang)
        : t('qrScannerClosed', lang);

  const subtitle =
    state === 'NO_TOKEN'
      ? t('qrScannerNoTokenSub', lang)
      : state === 'TOKEN_EXPIRED'
        ? t('qrScannerExpiredSub', lang)
        : t('qrScannerClosedSub', lang);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    if (state === 'SESSION_CLOSED') return;
    if (!videoRef.current) return;

    setError(null);
    setScanning(true);

    try {
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        async (result, err) => {
          if (!result) {
            // zxing fires continuously with null until a QR is found; ignore non-error nulls
            if (err && err.name !== 'NotFoundException') {
              stopScanner();
              setError(t('qrScannerRetry', lang));
            }
            return;
          }

          stopScanner();

          const text = result.getText();

          // Extract mesaId from QR URL pattern: /?mesa={uuid}
          let scannedMesaId: string | null = null;
          try {
            const url = new URL(text);
            scannedMesaId = url.searchParams.get('mesa');
          } catch {
            // not a valid URL
          }

          if (!scannedMesaId || scannedMesaId !== mesaId) {
            setError(t('qrScannerWrongMesa', lang));
            setTimeout(() => { void startScannerRef.current(); }, 1500);
            return;
          }

          try {
            const res = await fetch(`/api/mesas/${mesaId}/token`, { method: 'POST' });
            if (!res.ok) {
              const body = await res.json() as { error?: string };
              setError(body.error ?? t('qrScannerRetry', lang));
              setTimeout(() => { void startScannerRef.current(); }, 1500);
              return;
            }
            const data = await res.json() as { token: string; expiresAt: string };
            onTokenIssued(data.token, data.expiresAt);
          } catch {
            setError(t('qrScannerRetry', lang));
            setTimeout(() => { void startScannerRef.current(); }, 1500);
          }
        }
      );
    } catch (e) {
      setScanning(false);
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setError(t('qrScannerPermission', lang));
      } else {
        setError(t('qrScannerRetry', lang));
      }
    }
  }, [mesaId, state, onTokenIssued, stopScanner, lang]);

  // Keep the ref in sync so the zxing callback always has the latest version
  useEffect(() => {
    startScannerRef.current = startScanner;
  }, [startScanner]);

  useEffect(() => {
    void startScanner();
    return () => { stopScanner(); };
  }, [startScanner, stopScanner]);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>

        {state !== 'SESSION_CLOSED' && (
          <>
            <div className="relative w-64 h-64 rounded-2xl overflow-hidden bg-black border-2 border-primary">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-primary/60 rounded-lg" />
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            {!scanning && !error && (
              <button
                type="button"
                onClick={() => { void startScanner(); }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                {t('qrScannerRetry', lang)}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

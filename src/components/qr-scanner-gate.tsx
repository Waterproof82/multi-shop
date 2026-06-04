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
  onCancel?: () => void;
}

export function QRScannerGate({ mesaId, state, onTokenIssued, onCancel }: QRScannerGateProps) {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Per-invocation cancel fn. React StrictMode runs effects twice: cleanup fires before
  // decodeFromVideoDevice resolves, so isActiveRef would be reset to true by the second run
  // before invocation #1 checks it. A closure-local `cancelled` flag solves this correctly.
  const cancelCurrentScanRef = useRef<(() => void) | null>(null);
  // Ref so the zxing callback can schedule a retry without self-reference TDZ
  const startScannerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Guard: zxing fires the callback multiple times for the same QR; prevent duplicate token requests
  const tokenRequestInFlightRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [simulating, setSimulating] = useState(false);

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
    // Cancel the in-flight startScanner invocation so it stops its own orphaned stream on resolve
    cancelCurrentScanRef.current?.();
    cancelCurrentScanRef.current = null;

    const stream =
      streamRef.current ??
      (videoRef.current?.srcObject instanceof MediaStream ? videoRef.current.srcObject : null);

    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    stream?.getTracks().forEach(track => track.stop());
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    if (state === 'SESSION_CLOSED') return;
    if (!videoRef.current) return;

    // Local flag per invocation — immune to isActiveRef being reset by the second StrictMode run
    let cancelled = false;
    cancelCurrentScanRef.current = () => { cancelled = true; };

    setError(null);
    setScanning(true);

    try {
      const reader = new BrowserQRCodeReader();
      const video = videoRef.current;

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        video,
        async (result, _err) => {
          if (!result) {
            // NotFoundException is normal (no QR in frame yet), ignore.
            // Other errors on mobile are often transient (stream not ready on first frames).
            // Do NOT stop the scanner — let it keep running.
            return;
          }

          if (tokenRequestInFlightRef.current) return;
          tokenRequestInFlightRef.current = true;

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
            tokenRequestInFlightRef.current = false;
            setTimeout(() => { void startScannerRef.current(); }, 1500);
            return;
          }

          try {
            const res = await fetch(`/api/mesas/${mesaId}/token`, { method: 'POST' });
            if (!res.ok) {
              const body = await res.json() as { error?: string };
              setError(body.error ?? t('qrScannerRetry', lang));
              tokenRequestInFlightRef.current = false;
              // Don't auto-retry on rate limit (429) — user must tap retry manually
              if (res.status !== 429) {
                setTimeout(() => { void startScannerRef.current(); }, 1500);
              }
              return;
            }
            const data = await res.json() as { token: string; expiresAt: string };
            onTokenIssued(data.token, data.expiresAt);
          } catch {
            setError(t('qrScannerRetry', lang));
            tokenRequestInFlightRef.current = false;
            setTimeout(() => { void startScannerRef.current(); }, 1500);
          }
        }
      );

      if (cancelled) {
        // Cleanup ran while we were awaiting getUserMedia (React StrictMode or fast cancel).
        // Stop the orphaned stream immediately before returning.
        controls.stop();
        if (video.srcObject instanceof MediaStream) {
          const s = video.srcObject;
          video.srcObject = null;
          s.getTracks().forEach(t => t.stop());
        }
        return;
      }

      cancelCurrentScanRef.current = null;
      controlsRef.current = controls;
      if (video.srcObject instanceof MediaStream) {
        streamRef.current = video.srcObject;
      }
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
                autoPlay
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

        <div className="flex flex-col items-center gap-2 w-full mt-2">
          {state !== 'SESSION_CLOSED' && (
            <button
              type="button"
              disabled={simulating}
              onClick={async () => {
                if (tokenRequestInFlightRef.current) return;
                tokenRequestInFlightRef.current = true;
                setSimulating(true);
                stopScanner();
                try {
                  const res = await fetch(`/api/mesas/${mesaId}/token`, { method: 'POST' });
                  if (!res.ok) {
                    const body = await res.json() as { error?: string };
                    setError(body.error ?? t('qrScannerRetry', lang));
                    tokenRequestInFlightRef.current = false;
                  } else {
                    const data = await res.json() as { token: string; expiresAt: string };
                    onTokenIssued(data.token, data.expiresAt);
                  }
                } catch {
                  setError(t('qrScannerRetry', lang));
                  tokenRequestInFlightRef.current = false;
                } finally {
                  setSimulating(false);
                }
              }}
              className="w-full px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              {simulating ? '...' : t('qrScannerSimulate', lang)}
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={() => { stopScanner(); onCancel(); }}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/40"
            >
              {t('cancel', lang)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

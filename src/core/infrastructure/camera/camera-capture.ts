'use client';

import { useState, useRef, useCallback } from 'react';

export interface CameraCaptureOptions {
  /** Quality of the captured image (0-1) */
  quality?: number;
  /** Whether to allow editing after capture */
  allowEditing?: boolean;
  /** Source type: 'camera' | 'all' (default: 'all') */
  sourceType?: 'camera' | 'all';
}

export interface CameraCaptureResult {
  /** The captured image as a base64 string */
  dataUrl: string | null;
  /** The captured image as a File object */
  file: File | null;
  /** Error message if capture failed */
  error: string | null;
}

export interface UseCameraCaptureReturn {
  /** Current capture result */
  captureResult: CameraCaptureResult;
  /** Whether camera is currently active */
  isCapturing: boolean;
  /** Whether camera is supported on this device */
  isSupported: boolean;
  /** Trigger camera capture */
  capture: (options?: CameraCaptureOptions) => Promise<CameraCaptureResult>;
  /** Reset capture state */
  reset: () => void;
}

/**
 * Hook para capturar imágenes desde la cámara del dispositivo.
 * Soporta Android e iOS a través de la API de MediaDevices o input type="file" con capture.
 */
export function useCameraCapture(): UseCameraCaptureReturn {
  const [captureResult, setCaptureResult] = useState<CameraCaptureResult>({
    dataUrl: null,
    file: null,
    error: null,
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Verificar si la API de MediaDevices está disponible y soporta getUserMedia
  const isSupported = typeof window !== 'undefined' && 
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  // Método alternativo usando input file con atributo capture (funciona mejor en móviles)
  const captureViaInput = useCallback(async (options?: CameraCaptureOptions): Promise<CameraCaptureResult> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      
      // Para Android e iOS: usar capture="environment" para cámara trasera
      // o "user" para cámara frontal
      if (options?.sourceType === 'camera') {
        input.setAttribute('capture', 'environment');
      } else {
        // Por defecto intentar cámara trasera primero
        input.setAttribute('capture', 'environment');
      }

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        
        if (!file) {
          resolve({ dataUrl: null, file: null, error: 'No se seleccionó ninguna imagen' });
          return;
        }

        // Validar tipo de archivo
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          resolve({ dataUrl: null, file: null, error: 'Tipo de imagen no válido' });
          return;
        }

        // Validar tamaño (10MB max)
        if (file.size > 10 * 1024 * 1024) {
          resolve({ dataUrl: null, file: null, error: 'La imagen excede 10MB' });
          return;
        }

        try {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({ dataUrl, file, error: null });
          };
          reader.onerror = () => {
            resolve({ dataUrl: null, file: null, error: 'Error al leer la imagen' });
          };
          reader.readAsDataURL(file);
        } catch (err) {
          resolve({ dataUrl: null, file: null, error: 'Error al procesar la imagen' });
        }
      };

      input.oncancel = () => {
        resolve({ dataUrl: null, file: null, error: 'Captura cancelada' });
      };

      //触 发文件选择器
      input.click();
    });
  }, []);

  // Método principal de captura
  const capture = useCallback(async (options?: CameraCaptureOptions): Promise<CameraCaptureResult> => {
    setIsCapturing(true);
    
    try {
      // Primero intentar con API nativa de cámara (más control)
      if (isSupported && options?.sourceType === 'camera') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
              facingMode: 'environment', // Preferir cámara trasera
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }
          });
          
          // Crear video element temporal
          const video = document.createElement('video');
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('autoplay', 'true');
          
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Error al cargar video'));
          });

          // Capturar frame
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('No se pudo crear el contexto de canvas');
          }
          
          ctx.drawImage(video, 0, 0);
          
          // Detener stream
          stream.getTracks().forEach(track => track.stop());
          
          // Convertir a blob/file
          const quality = options?.quality ?? 0.85;
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          
          // Convertir dataUrl a File
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
          
          return { dataUrl, file, error: null };
        } catch {
          // Si falla la API nativa, caer al método alternativo
          console.warn('MediaDevices API falló, usando método alternativo');
        }
      }
      
      // Usar método alternativo (input file con capture)
      return await captureViaInput(options);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al capturar imagen';
      return { dataUrl: null, file: null, error: errorMessage };
    } finally {
      setIsCapturing(false);
    }
  }, [isSupported, captureViaInput]);

  const reset = useCallback(() => {
    setCaptureResult({ dataUrl: null, file: null, error: null });
  }, []);

  return {
    captureResult,
    isCapturing,
    isSupported,
    capture,
    reset,
  };
}

/**
 * Utility function para convertir un File a dataUrl (sin usar hook)
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Upload, Loader2, Pencil, Trash2, Camera } from 'lucide-react';
import { getCsrfToken } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { optimizeImage, optimizeBannerImage } from '@/lib/image-utils';
import { useAdmin } from '@/lib/admin-context';
import { ImageFit } from '@/core/application/dtos/menu-view-model';
import { useCameraCapture } from '@/core/infrastructure/camera/camera-capture';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ImageUploaderProps {
  readonly value: string;
  readonly onChange: (url: string) => void;
  readonly label?: string;
  readonly empresaSlug?: string;
  readonly empresaIdProp?: string;
  readonly previewClassName?: string;
  readonly previewStyle?: React.CSSProperties;
  readonly isBannerImage?: boolean;
  readonly aspectRatio?: string;
  readonly helpText?: string;
  readonly objectFit?: ImageFit;
  readonly onObjectFitChange?: (fit: ImageFit) => void;
}


export function ImageUploader({
  value,
  onChange,
  label = 'Imagen',
  empresaSlug = 'default',
  empresaIdProp,
  previewClassName = 'relative group rounded-lg overflow-hidden border h-48',
  previewStyle,
  isBannerImage = false,
  aspectRatio = '16/10',
  helpText,
  objectFit: propObjectFit,
  onObjectFitChange,
}: ImageUploaderProps) {
  const { language } = useLanguage();
  const { overrideEmpresaId, empresaId: defaultEmpresaId } = useAdmin();
  const efectivoEmpresaId = empresaIdProp || overrideEmpresaId || defaultEmpresaId;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [objectFit, setObjectFit] = useState<ImageFit>(propObjectFit || 'contain');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { capture: captureFromCamera, isCapturing: isCapturingCamera, isSupported: isCameraSupported } = useCameraCapture();

  // Manejar la foto capturada desde la cámara
  const handleCameraCapture = async () => {
    const result = await captureFromCamera({ sourceType: 'camera' });
    
    if (result.error) {
      // Si el usuario canceló, no mostrar error
      if (result.error !== 'Captura cancelada' && result.error !== 'No se seleccionó ninguna imagen') {
        setError(result.error);
      }
      return;
    }

    if (result.file) {
      // Procesar la imagen capturada igual que un archivo subido
      await handleFileSelect(result.file);
    }
  };

  useEffect(() => {
    if (propObjectFit) {
      setObjectFit(propObjectFit);
    }
  }, [propObjectFit]);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Tipo de archivo no permitido. Solo JPEG, PNG, WEBP o GIF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo excede el tamaño máximo de 10MB.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const optimized = isBannerImage ? await optimizeBannerImage(file) : await optimizeImage(file);

      const formData = new FormData();
      formData.append('file', optimized.file);

      const csrfToken = getCsrfToken();
      const uploadUrl = efectivoEmpresaId 
        ? `/api/admin/upload-image?empresaId=${efectivoEmpresaId}` 
        : '/api/admin/upload-image';
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Error al subir imagen');
      }

      const data = await response.json() as { publicUrl?: string };
      const publicUrl = data.publicUrl;
      if (!publicUrl) throw new Error('No se recibió la URL de la imagen');

      onChange(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemove = () => {
    onChange('');
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1">
          {label}
        </label>
      )}

      {value ? (
        <div 
          className={previewClassName} 
          style={{ 
            ...previewStyle,
            aspectRatio: aspectRatio 
          }}
        >
          <Image
            src={value}
            alt={`${label} preview`}
            fill
            className={`object-${objectFit}`}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority={false}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-overlay opacity-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClick}
                className="px-3 py-1.5 bg-card text-card-foreground rounded-md text-sm hover:bg-muted"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-sm hover:bg-destructive/90"
              >
                Eliminar
              </button>
            </div>
            {onObjectFitChange && (
              <Select
                value={objectFit}
                onValueChange={(v) => onObjectFitChange(v as ImageFit)}
              >
                <SelectTrigger className="w-28 h-8 bg-card/90 backdrop-blur-sm text-card-foreground text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">Contain</SelectItem>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="fill">Fill</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="scale-down">Scale</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="md:hidden absolute bottom-2 right-2 flex gap-2">
            <button
              type="button"
              onClick={handleClick}
              className="p-3 bg-card/90 backdrop-blur-sm rounded-full shadow-elegant outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("changeImage", language)}
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-3 bg-destructive/90 backdrop-blur-sm rounded-full shadow-elegant outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("deleteImage", language)}
            >
              <Trash2 className="w-4 h-4 text-destructive-foreground" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={uploading || isCapturingCamera}
            className={`
              flex-1 border-2 border-dashed rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer transition-colors
              ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}
              ${uploading || isCapturingCamera ? 'pointer-events-none opacity-50' : ''}
            `}
            aria-label={t("uploadImage", language)}
          >
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 text-primary animate-spin motion-reduce:animate-none" />
                <span className="text-sm text-muted-foreground mt-1">Subiendo...</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <span className="text-sm text-muted-foreground mt-1">
                  Arrastra o click
                </span>
              </>
            )}
          </button>

          {isCameraSupported && (
            <button
              type="button"
              onClick={handleCameraCapture}
              disabled={uploading || isCapturingCamera}
              className={`
                flex-1 border-2 border-dashed rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer transition-colors
                ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}
                ${uploading || isCapturingCamera ? 'pointer-events-none opacity-50' : ''}
              `}
              aria-label={t("takePhoto", language) || "Tomar foto"}
            >
              {isCapturingCamera ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin motion-reduce:animate-none" />
                  <span className="text-sm text-muted-foreground mt-1">Capturando...</span>
                </>
              ) : (
                <>
                  <Camera className="h-8 w-8 text-muted-foreground/50" />
                  <span className="text-sm text-muted-foreground mt-1">
                    {t("takePhoto", language) || "Tomar foto"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleInputChange}
        className="hidden"
      />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {helpText && (
        <p className="text-xs text-muted-foreground mt-1">{helpText}</p>
      )}
    </div>
  );
}

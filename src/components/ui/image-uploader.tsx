'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Upload, Loader2 } from 'lucide-react';
import { uploadImageAction } from '@/core/application/actions/storage.actions';

interface ImageUploaderProps {
  readonly value: string;
  readonly onChange: (url: string) => void;
  readonly label?: string;
  readonly empresaSlug?: string;
}

const MAX_WIDTH = 480;
const MAX_HEIGHT = 480;
const QUALITY = 0.8;

async function optimizeImage(file: File): Promise<{ file: File; type: string }> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width;
        width = MAX_WIDTH;
      }
      if (height > MAX_HEIGHT) {
        width = (width * MAX_HEIGHT) / height;
        height = MAX_HEIGHT;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo crear el contexto de canvas'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Error al comprimir imagen'));
            return;
          }
          const optimizedFile = new File([blob], file.name, {
            type: 'image/webp',
          });
          resolve({ file: optimizedFile, type: 'image/webp' });
        },
        'image/webp',
        QUALITY
      );
    };
    img.onerror = () => reject(new Error('Error al cargar imagen'));
    img.src = URL.createObjectURL(file);
  });
}

export function ImageUploader({ 
  value, 
  onChange, 
  label = 'Imagen',
  empresaSlug = 'default'
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const optimized = await optimizeImage(file);
      
      const result = await uploadImageAction(
        optimized.file.name, 
        optimized.type, 
        optimized.file.size, 
        empresaSlug
      );
      
      const uploadResponse = await fetch(result.url, {
        method: 'PUT',
        body: optimized.file,
        headers: { 'Content-Type': optimized.type },
      });

      if (!uploadResponse.ok) {
        throw new Error('Error al subir imagen');
      }

      onChange(result.publicUrl);
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {value ? (
        <div className="relative group rounded-lg overflow-hidden border h-48">
          <Image
            src={value}
            alt="Preview"
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleClick}
              className="px-3 py-1.5 bg-white text-gray-900 rounded-md text-sm hover:bg-gray-100"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
            >
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={uploading}
          className={`
            border-2 border-dashed rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer transition-colors
            ${dragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'}
            ${uploading ? 'pointer-events-none opacity-50' : ''}
          `}
          aria-label="Subir imagen"
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <span className="text-sm text-gray-500 mt-1">Subiendo...</span>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-gray-500 mt-1">
                Arrastra o click para subir
              </span>
              <span className="text-xs text-gray-400">JPEG, PNG, WEBP (max 10MB)</span>
            </>
          )}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleInputChange}
        className="hidden"
      />

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

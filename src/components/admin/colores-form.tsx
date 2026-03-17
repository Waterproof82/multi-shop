'use client';

import { useState, useEffect } from 'react';
import { EmpresaColores } from '@/core/domain/entities/types';
import { DEFAULT_EMPRESA_COLORES } from '@/core/domain/constants/empresa-defaults';

interface ColoresFormProps {
  readonly coloresIniciales: EmpresaColores | null;
  readonly empresaId: string;
}

type ColorKey = keyof EmpresaColores;

const LABELS: Record<ColorKey, string> = {
  primary: 'Color Principal',
  primaryForeground: 'Color del texto principal',
  secondary: 'Color secundario',
  secondaryForeground: 'Color del texto secundario',
  accent: 'Color de acento',
  accentForeground: 'Color del texto de acento',
  background: 'Color de fondo',
  foreground: 'Color del texto',
};

export function ColoresForm({ coloresIniciales, empresaId }: ColoresFormProps) {
  const [colores, setColores] = useState<EmpresaColores>({ ...DEFAULT_EMPRESA_COLORES });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (coloresIniciales) {
      setColores(coloresIniciales);
    }
  }, [coloresIniciales]);

  const handleChange = (key: ColorKey, value: string) => {
    setColores((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/admin/update-colores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId, colores }),
      });

      if (res.ok) {
        setSaved(true);
        globalThis.location.reload();
      }
    } catch (error) {
      console.error('Error guardando colores:', error);
    } finally {
      setSaving(false);
    }
  };

  const colorKeys: ColorKey[] = [
    'primary',
    'primaryForeground',
    'secondary',
    'secondaryForeground',
    'accent',
    'accentForeground',
    'background',
    'foreground',
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {colorKeys.map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <label htmlFor={`color-picker-${key}`} className="text-sm font-medium text-foreground">
              {LABELS[key]}
            </label>
            <div className="flex gap-2">
              <input
                id={`color-picker-${key}`}
                name={`color-picker-${key}`}
                type="color"
                value={colores[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-12 h-10 rounded cursor-pointer border-0"
              />
              <input
                id={`color-text-${key}`}
                name={`color-text-${key}`}
                type="text"
                value={colores[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="flex-1 px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Guardando...' : 'Guardar colores'}
        </button>
        {saved && (
          <span className="text-primary text-sm">¡Colores guardados correctamente!</span>
        )}
      </div>

      <div className="mt-6 p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-3 text-foreground">Vista previa</h4>
        <div
          className="p-4 rounded-lg border"
          style={{
            backgroundColor: colores.background,
            borderColor: colores.secondary,
          }}
        >
          <h5
            className="text-lg font-bold mb-2"
            style={{ color: colores.primary }}
          >
            Título de ejemplo
          </h5>
          <p
            className="mb-3"
            style={{ color: colores.foreground }}
          >
            Este es un texto de ejemplo con el color de texto principal.
          </p>
          <span
            className="inline-block px-3 py-1 rounded text-sm"
            style={{
              backgroundColor: colores.secondary,
              color: colores.secondaryForeground,
            }}
          >
            Secondary
          </span>{' '}
          <span
            className="inline-block px-3 py-1 rounded text-sm"
            style={{
              backgroundColor: colores.accent,
              color: colores.accentForeground,
            }}
          >
            Accent
          </span>
        </div>
      </div>
    </form>
  );
}

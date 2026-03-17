'use client';

import { useEffect, useState, ReactNode, useMemo } from 'react';
import { EmpresaColores } from '@/core/domain/entities/types';

interface EmpresaThemeProviderProps {
  children: ReactNode;
  colores: EmpresaColores | null;
}

const HEX_COLOR_RE = /^#[\da-f]{6}$/i;

function isValidHex(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

/**
 * Applies tenant brand colors to CSS custom properties.
 * Uses CSS native light-dark() for automatic dark mode handling.
 */
export function EmpresaThemeProvider({ children, colores }: EmpresaThemeProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const brandColors = useMemo(() => {
    if (!colores) return null;

    return {
      primary: colores.primary,
      primaryForeground: colores.primaryForeground,
      secondary: colores.secondary,
      secondaryForeground: colores.secondaryForeground,
      accent: colores.accent,
      accentForeground: colores.accentForeground,
    };
  }, [colores]);

  useEffect(() => {
    if (!brandColors || !mounted) return;

    const root = document.documentElement;

    const tokenMap: Record<string, string> = {
      '--primary': brandColors.primary,
      '--primary-foreground': brandColors.primaryForeground,
      '--secondary': brandColors.secondary,
      '--secondary-foreground': brandColors.secondaryForeground,
      '--accent': brandColors.accent,
      '--accent-foreground': brandColors.accentForeground,
      '--ring': brandColors.primary,
    };

    const appliedProps: string[] = [];
    for (const [prop, value] of Object.entries(tokenMap)) {
      if (!isValidHex(value)) continue;
      root.style.setProperty(prop, value);
      root.style.setProperty(`--color-${prop.slice(2)}`, value);
      appliedProps.push(prop, `--color-${prop.slice(2)}`);
    }

    return () => {
      for (const prop of appliedProps) {
        root.style.removeProperty(prop);
      }
    };
  }, [brandColors, mounted]);

  return <>{children}</>;
}

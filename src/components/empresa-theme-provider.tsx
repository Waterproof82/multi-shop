'use client';

import { useEffect, ReactNode, useMemo, useSyncExternalStore } from 'react';
import { EmpresaColores } from '@/core/domain/entities/types';

interface EmpresaThemeProviderProps {
  children: ReactNode;
  colores: EmpresaColores | null;
}

const HEX_COLOR_RE = /^#[\da-f]{6}$/i;

function isValidHex(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

function getSystemDarkMode(): boolean {
  if (typeof globalThis === 'undefined') return false;
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribeToDarkMode(callback: () => void): () => void {
  if (typeof globalThis === 'undefined') return () => {};
  const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

function lightenColor(hex: string, percent: number): string {
  const num = Number.parseInt(hex.replaceAll('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

function darkenColor(hex: string, percent: number): string {
  const num = Number.parseInt(hex.replaceAll('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);
  return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

function getLuminance(hex: string): number {
  const rgb = hex.replaceAll('#', '').match(/.{2}/g)?.map(x => Number.parseInt(x, 16) / 255) || [0, 0, 0];
  const [r, g, b] = rgb.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isColorDark(hex: string): boolean {
  return getLuminance(hex) < 0.5;
}

function adjustForDarkMode(hex: string, isDarkMode: boolean): string {
  if (!isDarkMode) return hex;
  const isDark = isColorDark(hex);
  if (isDark) {
    return lightenColor(hex, 15);
  } else {
    return darkenColor(hex, 15);
  }
}

function adjustForegroundForBackground(foreground: string, background: string, isDarkMode: boolean): string {
  const bgIsDark = isColorDark(background);
  const fgIsDark = isColorDark(foreground);
  
  if (isDarkMode && !bgIsDark && fgIsDark) {
    return darkenColor(foreground, 30);
  }
  if (!isDarkMode && bgIsDark && !fgIsDark) {
    return lightenColor(foreground, 30);
  }
  return foreground;
}

export function EmpresaThemeProvider({ children, colores }: Readonly<EmpresaThemeProviderProps>) {
  const isDarkMode = useSyncExternalStore(
    subscribeToDarkMode,
    getSystemDarkMode,
    () => false
  );

  const brandColors = useMemo(() => {
    if (!colores) return null;

    const primary = colores.primary;
    const secondary = colores.secondary;
    const accent = colores.accent;
    
    const primaryForeground = adjustForegroundForBackground(
      colores.primaryForeground,
      primary,
      isDarkMode
    );
    const secondaryForeground = adjustForegroundForBackground(
      colores.secondaryForeground,
      secondary,
      isDarkMode
    );
    const accentForeground = adjustForegroundForBackground(
      colores.accentForeground,
      accent,
      isDarkMode
    );

    return {
      primary: adjustForDarkMode(primary, isDarkMode),
      primaryForeground,
      secondary: adjustForDarkMode(secondary, isDarkMode),
      secondaryForeground,
      accent: adjustForDarkMode(accent, isDarkMode),
      accentForeground,
    };
  }, [colores, isDarkMode]);

  useEffect(() => {
    if (!brandColors) return;

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

    for (const [prop, value] of Object.entries(tokenMap)) {
      if (isValidHex(value)) {
        root.style.setProperty(prop, value);
        root.style.setProperty(`--color-${prop.slice(2)}`, value);
      }
    }

    return () => {
      const propsToRemove = Object.keys(tokenMap).flatMap(prop => [prop, `--color-${prop.slice(2)}`]);
      for (const prop of propsToRemove) {
        root.style.removeProperty(prop);
      }
    };
  }, [brandColors]);

  return <>{children}</>;
}

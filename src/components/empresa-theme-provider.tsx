'use client';

import { useEffect, useState, ReactNode } from 'react';
import { EmpresaColores } from '@/core/domain/entities/types';

interface EmpresaThemeProviderProps {
  children: ReactNode;
  colores: EmpresaColores | null;
}

const darkColors: EmpresaColores = {
  primary: '#00A855',
  primaryForeground: '#FFFFFF',
  secondary: '#3C2415',
  secondaryForeground: '#F7E7CE',
  accent: '#E83A4D',
  accentForeground: '#FFFFFF',
  background: '#1A1612',
  foreground: '#FDFBF7',
};

function getInitialTheme(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function EmpresaThemeProvider({ children, colores }: EmpresaThemeProviderProps) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(getInitialTheme());
  }, []);

  useEffect(() => {
    if (!colores || !mounted) return;

    const root = document.documentElement;
    const colorsToApply = isDark ? darkColors : colores;

    root.style.setProperty('--primary', colorsToApply.primary);
    root.style.setProperty('--primary-foreground', colorsToApply.primaryForeground);
    root.style.setProperty('--secondary', colorsToApply.secondary);
    root.style.setProperty('--secondary-foreground', colorsToApply.secondaryForeground);
    root.style.setProperty('--accent', colorsToApply.accent);
    root.style.setProperty('--accent-foreground', colorsToApply.accentForeground);
    root.style.setProperty('--background', colorsToApply.background);
    root.style.setProperty('--foreground', colorsToApply.foreground);
    root.style.setProperty('--ring', colorsToApply.primary);
    root.style.setProperty('--color-primary', colorsToApply.primary);
    root.style.setProperty('--color-primary-foreground', colorsToApply.primaryForeground);
    root.style.setProperty('--color-secondary', colorsToApply.secondary);
    root.style.setProperty('--color-secondary-foreground', colorsToApply.secondaryForeground);
    root.style.setProperty('--color-accent', colorsToApply.accent);
    root.style.setProperty('--color-accent-foreground', colorsToApply.accentForeground);
    root.style.setProperty('--color-background', colorsToApply.background);
    root.style.setProperty('--color-foreground', colorsToApply.foreground);
    root.style.setProperty('--color-ring', colorsToApply.primary);

    root.style.setProperty('--sidebar-primary', colorsToApply.primary);
    root.style.setProperty('--sidebar-primary-foreground', colorsToApply.primaryForeground);
    root.style.setProperty('--sidebar', colorsToApply.secondary);
    root.style.setProperty('--sidebar-foreground', colorsToApply.secondaryForeground);
    root.style.setProperty('--sidebar-ring', colorsToApply.primary);

    root.style.setProperty('--card', colorsToApply.background);
    root.style.setProperty('--card-foreground', colorsToApply.foreground);
    root.style.setProperty('--popover', colorsToApply.background);
    root.style.setProperty('--popover-foreground', colorsToApply.foreground);
    root.style.setProperty('--muted', colorsToApply.secondary);
    root.style.setProperty('--muted-foreground', colorsToApply.secondaryForeground);
    root.style.setProperty('--destructive', colorsToApply.accent);
    root.style.setProperty('--destructive-foreground', colorsToApply.accentForeground);
    root.style.setProperty('--border', colorsToApply.secondary);
    root.style.setProperty('--input', colorsToApply.secondary);

  }, [colores, isDark, mounted]);

  useEffect(() => {
    if (!colores) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [colores]);

  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

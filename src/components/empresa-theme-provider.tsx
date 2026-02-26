'use client';

import { useEffect, useState, ReactNode } from 'react';
import { EmpresaColores } from '@/core/domain/entities/types';

interface EmpresaThemeProviderProps {
  children: ReactNode;
  colores: EmpresaColores | null;
}

export function EmpresaThemeProvider({ children, colores }: EmpresaThemeProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!colores) return;

    const root = document.documentElement;

    root.style.setProperty('--primary', colores.primary);
    root.style.setProperty('--primary-foreground', colores.primaryForeground);
    root.style.setProperty('--secondary', colores.secondary);
    root.style.setProperty('--secondary-foreground', colores.secondaryForeground);
    root.style.setProperty('--accent', colores.accent);
    root.style.setProperty('--accent-foreground', colores.accentForeground);
    root.style.setProperty('--background', colores.background);
    root.style.setProperty('--foreground', colores.foreground);
    root.style.setProperty('--ring', colores.primary);
    root.style.setProperty('--color-primary', colores.primary);
    root.style.setProperty('--color-primary-foreground', colores.primaryForeground);
    root.style.setProperty('--color-secondary', colores.secondary);
    root.style.setProperty('--color-secondary-foreground', colores.secondaryForeground);
    root.style.setProperty('--color-accent', colores.accent);
    root.style.setProperty('--color-accent-foreground', colores.accentForeground);
    root.style.setProperty('--color-background', colores.background);
    root.style.setProperty('--color-foreground', colores.foreground);
    root.style.setProperty('--color-ring', colores.primary);

    root.style.setProperty('--sidebar-primary', colores.primary);
    root.style.setProperty('--sidebar-primary-foreground', colores.primaryForeground);
    root.style.setProperty('--sidebar', colores.secondary);
    root.style.setProperty('--sidebar-foreground', colores.secondaryForeground);
    root.style.setProperty('--sidebar-ring', colores.primary);

    root.style.setProperty('--card', colores.background);
    root.style.setProperty('--card-foreground', colores.foreground);
    root.style.setProperty('--popover', colores.background);
    root.style.setProperty('--popover-foreground', colores.foreground);
    root.style.setProperty('--muted', colores.secondary);
    root.style.setProperty('--muted-foreground', colores.secondaryForeground);
    root.style.setProperty('--destructive', colores.accent);
    root.style.setProperty('--destructive-foreground', colores.accentForeground);
    root.style.setProperty('--border', colores.secondary);
    root.style.setProperty('--input', colores.secondary);

  }, [colores]);

  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

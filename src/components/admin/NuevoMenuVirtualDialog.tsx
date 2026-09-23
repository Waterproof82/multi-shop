'use client';

import { useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface NuevoMenuVirtualDialogProps {
  open: boolean;
  esSubcategoria: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (nombre: string) => void;
}

export function NuevoMenuVirtualDialog({
  open,
  esSubcategoria,
  saving,
  onOpenChange,
  onConfirm,
}: Readonly<NuevoMenuVirtualDialogProps>) {
  const { language } = useLanguage();
  const [nombre, setNombre] = useState('');

  function handleOpenChange(next: boolean) {
    if (!next) setNombre('');
    onOpenChange(next);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nombre.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setNombre('');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {esSubcategoria
              ? t('menuVirtualCrearSubcategoriaTitulo', language)
              : t('menuVirtualCrearTitulo', language)}
          </DialogTitle>
          <DialogDescription>{t('menuVirtualCrearDescripcion', language)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nuevo-menu-virtual-nombre" className="block text-sm font-medium text-foreground mb-1">
              {t('menuVirtualNombre', language)}
            </label>
            <Input
              id="nuevo-menu-virtual-nombre"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder={t('menuVirtualNombrePlaceholder', language)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => handleOpenChange(false)}>
              {t('cancel', language)}
            </Button>
            <Button type="submit" disabled={saving || nombre.trim().length === 0}>
              {t('menuVirtualCrearConfirmar', language)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

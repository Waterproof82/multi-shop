'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface EliminarMenuVirtualDialogProps {
  open: boolean;
  nodoNombre: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function EliminarMenuVirtualDialog({
  open,
  nodoNombre,
  onOpenChange,
  onConfirm,
}: Readonly<EliminarMenuVirtualDialogProps>) {
  const { language } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('menuVirtualEliminarTitulo', language)}</DialogTitle>
          <DialogDescription>
            {t('menuVirtualEliminarConfirm', language)} <strong>{nodoNombre}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            {t('cancel', language)}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t('menuVirtualEliminar', language)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

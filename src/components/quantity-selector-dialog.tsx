"use client"

import { useState, useEffect } from "react"
import { Plus, Minus, Check, Pause, MessageSquarePlus, ChevronUp } from "lucide-react"
import { getWaiterMesa } from "@/components/waiter-login-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RippleButton } from "@/components/ui/ripple-button"
import { useLanguage } from "@/lib/language-context"
import { useCart } from "@/lib/cart-context"
import { t } from "@/lib/translations"
import { formatPrice } from "@/lib/format-price"
import type { MenuItemVM, ComplementGroupVM, ComplementVM } from "@/core/application/dtos/menu-view-model"

interface QuantitySelectorDialogProps {
  item: MenuItemVM | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getEffectiveGroups(item: MenuItemVM): ComplementGroupVM[] {
  if (item.complementGroups && item.complementGroups.length > 0) {
    return item.complementGroups;
  }
  if (item.complements && item.complements.length > 0) {
    return [{
      id: '__legacy__',
      name: item.complements[0]?.name ?? 'Opciones',
      tipo: 'radio',
      obligatorio: item.requiresComplement ?? false,
      opciones: item.complements,
    }];
  }
  return [];
}

function isGroupsValid(groups: ComplementGroupVM[], selectedByGroup: Record<string, Set<string>>): boolean {
  return groups
    .filter(g => g.obligatorio)
    .every(g => (selectedByGroup[g.id]?.size ?? 0) > 0);
}

function getBadgeText(grupo: ComplementGroupVM): string {
  if (!grupo.obligatorio) {
    return grupo.tipo === 'radio' ? 'Opcional · elige 1' : 'Opcional';
  }
  return grupo.tipo === 'radio' ? 'Obligatorio · elige 1' : 'Obligatorio · elige al menos 1';
}

function resolveOpcionName(opcion: ComplementVM, language: string): string {
  const lang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as 'en' | 'fr' | 'it' | 'de' | undefined;
  if (lang && opcion.translations?.[lang]?.name) {
    return opcion.translations[lang].name;
  }
  return opcion.name;
}

export function QuantitySelectorDialog(props: Readonly<QuantitySelectorDialogProps>) {
  const { item, open, onOpenChange } = props;
  const [quantity, setQuantity] = useState(1)
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, Set<string>>>({})
  const [addedAnimation, setAddedAnimation] = useState(false)
  const [isDeferred, setIsDeferred] = useState(false)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const { language } = useLanguage()
  const { addItem } = useCart()

  const isWaiterMode = !!getWaiterMesa()

  useEffect(() => {
    if (open && item) {
      setQuantity(1);
      setSelectedByGroup({});
      setIsDeferred(false);
      setNote('');
      setShowNote(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const effectiveGroups = item ? getEffectiveGroups(item) : [];

  const complementsExtra = effectiveGroups
    .flatMap(g => g.opciones.filter(o => selectedByGroup[g.id]?.has(o.id)))
    .reduce((s, o) => s + o.price, 0);
  const totalPrice = ((item?.price ?? 0) + complementsExtra) * quantity;

  function toggleRadio(grupoId: string, opcionId: string) {
    setSelectedByGroup(prev => {
      const already = prev[grupoId]?.has(opcionId) ?? false;
      return { ...prev, [grupoId]: already ? new Set() : new Set([opcionId]) };
    });
  }

  function toggleCheckbox(grupoId: string, opcionId: string) {
    setSelectedByGroup(prev => {
      const current = new Set(prev[grupoId] ?? []);
      if (current.has(opcionId)) {
        current.delete(opcionId);
      } else {
        current.add(opcionId);
      }
      return { ...prev, [grupoId]: current };
    });
  }

  const handleIncrement = () => {
    setQuantity((prev) => prev + 1)
  }

  const handleDecrement = () => {
    setQuantity((prev) => Math.max(1, prev - 1))
  }

  const handleConfirmAddToCart = () => {
    if (!item || quantity < 1) return;
    if (!isGroupsValid(effectiveGroups, selectedByGroup)) return;

    const selectedOpciones = effectiveGroups.flatMap(g =>
      g.opciones.filter(o => selectedByGroup[g.id]?.has(o.id))
    );
    const complementos = selectedOpciones.length > 0 ? selectedOpciones : undefined;
    addItem(item, quantity, complementos, isDeferred || undefined, note.trim() || undefined);
    setAddedAnimation(true);
    setTimeout(() => {
      onOpenChange(false);
      setQuantity(1);
      setSelectedByGroup({});
      setIsDeferred(false);
      setNote('');
      setShowNote(false);
      setAddedAnimation(false);
    }, 300);
  }

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none flex flex-col p-0 gap-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="px-5 pt-5 pb-4 shrink-0 border-b">
          <DialogTitle>{t("selectQuantity", language)}</DialogTitle>
          <DialogDescription>
            {t("quantityFor", language)} {(language !== "es" && item.translations?.[language]?.name) || item.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-4">
          {effectiveGroups.length > 0 && (
            <div style={{ scrollbarWidth: 'thin' }}>
              {effectiveGroups.map(grupo => {
                const selectedCount = selectedByGroup[grupo.id]?.size ?? 0;
                const isComplete = grupo.obligatorio ? selectedCount > 0 : true;
                const progressMax = grupo.tipo === 'radio' ? 1 : Math.max(1, grupo.opciones.length);
                const progressPct = isComplete ? 100 : Math.min(100, (selectedCount / progressMax) * 100);
                return (
                  <div key={grupo.id} className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">{grupo.name}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: grupo.obligatorio ? 'oklch(95% 0.05 0)' : 'oklch(95% 0.02 250)',
                          color: grupo.obligatorio ? 'oklch(45% 0.15 25)' : 'oklch(45% 0.08 250)',
                        }}
                      >
                        {getBadgeText(grupo)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full mb-2 overflow-hidden bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${progressPct}%`,
                          background: isComplete
                            ? (grupo.obligatorio ? 'oklch(60% 0.15 145)' : 'oklch(60% 0.15 250)')
                            : 'oklch(60% 0.18 25)',
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {grupo.opciones.map(opcion => {
                        const isSelected = selectedByGroup[grupo.id]?.has(opcion.id) ?? false;
                        const toggle = grupo.tipo === 'radio'
                          ? () => toggleRadio(grupo.id, opcion.id)
                          : () => toggleCheckbox(grupo.id, opcion.id);
                        return (
                          <button
                            key={opcion.id}
                            type="button"
                            role={grupo.tipo === 'radio' ? 'radio' : 'checkbox'}
                            aria-checked={isSelected}
                            onClick={toggle}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all w-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            style={{
                              background: isSelected ? 'color-mix(in oklch, var(--color-primary) 15%, transparent)' : 'transparent',
                              borderColor: isSelected ? 'var(--color-primary)' : undefined,
                            }}
                          >
                            <span
                              className={`w-4 h-4 shrink-0 flex items-center justify-center border-2 transition-colors ${isSelected ? 'border-primary' : 'border-muted-foreground/40'}`}
                              style={{ borderRadius: grupo.tipo === 'radio' ? '50%' : '4px' }}
                            >
                              {isSelected && grupo.tipo === 'radio' && (
                                <span className="w-2 h-2 rounded-full bg-primary" />
                              )}
                              {isSelected && grupo.tipo === 'checkbox' && (
                                <span className="text-[10px] font-bold leading-none text-primary">✓</span>
                              )}
                            </span>
                            <span className="flex-1 text-sm">{resolveOpcionName(opcion, language)}</span>
                            {opcion.price > 0 && (
                              <span className="text-xs font-medium shrink-0 text-primary">
                                +{formatPrice(opcion.price, 'EUR', language)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowNote(v => !v)}
              className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                showNote
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <MessageSquarePlus className={`w-3.5 h-3.5 shrink-0 transition-colors ${showNote ? 'text-primary' : ''}`} />
              <span className="flex-1 text-left">{t("itemNote", language)}{note && !showNote ? ` · ${note.length > 30 ? note.slice(0, 30) + '…' : note}` : ''}</span>
              <ChevronUp className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${showNote ? 'rotate-0' : 'rotate-180'}`} />
            </button>
            {showNote && (
              <Textarea
                id="item-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("itemNotePlaceholder", language)}
                className="resize-none text-sm"
                rows={2}
                maxLength={500}
                autoFocus
              />
            )}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="quantity" className="text-right">
              {t("quantity", language)}
            </Label>
            <div className="col-span-3 flex items-center justify-center">
              <RippleButton
                variant="outline"
                size="icon"
                className="h-11 w-11 md:h-10 md:w-10"
                onClick={handleDecrement}
                disabled={quantity <= 1}
                aria-label={t("reduceQuantity", language)}
              >
                <Minus className="h-4 w-4" />
              </RippleButton>
              <Input
                id="quantity"
                type="text"
                value={quantity}
                className="mx-1 h-10 w-12 flex items-center justify-center text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                readOnly
                tabIndex={0}
                aria-live="polite"
                aria-label={t("quantity", language)}
              />
              <RippleButton variant="outline" size="icon" className="h-11 w-11 md:h-10 md:w-10" onClick={handleIncrement} aria-label={t("increaseQuantity", language)}>
                <Plus className="h-4 w-4" />
              </RippleButton>
            </div>
          </div>
          <div className="flex justify-between items-center text-lg font-bold">
            <span>{t("total", language)}:</span>
            <span className="animate-price-update" key={totalPrice}>{formatPrice(totalPrice, 'EUR', language)}</span>
          </div>

          {isWaiterMode && item.tipoProducto !== 'bebida' && (
          <button
            type="button"
            onClick={() => setIsDeferred(prev => !prev)}
            className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all ${
              isDeferred
                ? 'border-orange-400/60 bg-orange-50 dark:bg-orange-950/30'
                : 'border-border bg-muted/40 hover:bg-muted/70'
            }`}
          >
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
              isDeferred ? 'border-orange-500 bg-orange-500' : 'border-muted-foreground/40'
            }`}>
              {isDeferred && <Check className="w-3 h-3 text-white" />}
            </div>
            <Pause className={`w-4 h-4 shrink-0 ${isDeferred ? 'text-orange-500' : 'text-muted-foreground'}`} />
            <span className={isDeferred ? 'font-semibold text-orange-700 dark:text-orange-300' : 'text-muted-foreground'}>
              Añadir como retenido
            </span>
          </button>
          )}
          </div>
        </div>

        <DialogFooter className="px-5 py-4 shrink-0 border-t">
          <RippleButton
            type="button"
            onClick={handleConfirmAddToCart}
            disabled={!isGroupsValid(effectiveGroups, selectedByGroup) || addedAnimation}
            className={addedAnimation ? 'animate-complement-select' : ''}
          >
            {addedAnimation ? (
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4" />
              </span>
            ) : (
              t("addToCart", language)
            )}
          </RippleButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

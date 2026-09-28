"use client"

import { useState, useEffect } from "react"
import { Plus, Minus, Check, MessageSquarePlus, ChevronUp } from "lucide-react"
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
import { ProductImageGallery } from "@/components/product-image-gallery"
import { ImageZoomDialog } from "@/components/image-zoom-dialog"
import { useLanguage } from "@/lib/language-context"
import { useCart } from "@/lib/cart-context"
import { t } from "@/lib/translations"
import { formatPrice } from "@/lib/format-price"
import type { MenuItemVM, ComplementGroupVM, ComplementVM, ProductoTablaVM, TablaCeldaVM } from "@/core/application/dtos/menu-view-model"
import { AllergenList } from "@/components/allergen-icons"

type LanguageKey = 'en' | 'fr' | 'it' | 'de';

function asLanguageKey(language: string): LanguageKey | undefined {
  return (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as LanguageKey | undefined;
}

function resolveDescription(item: MenuItemVM, language: string): string | undefined {
  const lang = asLanguageKey(language);
  if (lang && item.translations?.[lang]?.description) {
    return item.translations[lang].description;
  }
  return item.description;
}

function resolveCelda(celda: TablaCeldaVM, language: string): string {
  const lang = asLanguageKey(language);
  if (lang && celda[lang]) return celda[lang];
  return celda.es;
}

function filaKey(fila: TablaCeldaVM[]): string {
  return fila.map(celda => celda.es).join('|');
}

function zipCeldaConColumna(fila: TablaCeldaVM[], columnas: TablaCeldaVM[]): { celda: TablaCeldaVM; columnaKey: string }[] {
  return fila.map((celda, idx) => ({ celda, columnaKey: columnas[idx]?.es ?? celda.es }));
}

function ProductTableRowMobile({ fila, columnas, language, startIndex }: Readonly<{
  fila: TablaCeldaVM[];
  columnas: TablaCeldaVM[];
  language: string;
  startIndex: number;
}>) {
  return (
    <>
      {zipCeldaConColumna(fila, columnas).map(({ celda, columnaKey }, idx) => {
        const isOdd = (startIndex + idx) % 2 === 1;
        return (
          <div
            key={columnaKey}
            className={`grid grid-cols-2 gap-2 px-3 py-2 border-b border-border last:border-b-0 ${isOdd ? 'bg-muted/30' : 'bg-primary/5'}`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              {resolveCelda(columnas[idx] ?? celda, language)}
            </span>
            <span className="text-sm text-foreground">{resolveCelda(celda, language)}</span>
          </div>
        );
      })}
    </>
  );
}

function ProductTable({ table, language }: Readonly<{ table: ProductoTablaVM; language: string }>) {
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-xs">
      <div className="md:hidden">
        {table.filas.map((fila, r) => (
          <ProductTableRowMobile
            key={filaKey(fila)}
            fila={fila}
            columnas={table.columnas}
            language={language}
            startIndex={r * table.columnas.length}
          />
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-primary/10">
              {table.columnas.map((columna) => (
                <th
                  key={columna.es}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary border-r border-border last:border-r-0"
                >
                  {resolveCelda(columna, language)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {table.filas.map((fila, r) => (
              <tr key={filaKey(fila)} className={r % 2 === 1 ? 'bg-muted/30' : 'bg-primary/5'}>
                {zipCeldaConColumna(fila, table.columnas).map(({ celda, columnaKey }) => (
                  <td key={columnaKey} className="px-3 py-2 text-foreground border-r border-border last:border-r-0">
                    {resolveCelda(celda, language)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Video de cabecera del dialogo para productos con `.mp4` en `image` (mismo
 * campo que usan las tarjetas del catalogo): no tienen un fotograma fijo
 * utilizable como imagen, así que se reproducen igual que en
 * `menu-section.tsx` en vez de mostrarse rotos. El slot de segunda imagen
 * (`image2`) no aplica a video.
 */
function DialogVideo({ src, alt }: Readonly<{ src: string; alt: string }>) {
  return (
    <video
      src={src}
      autoPlay
      loop
      muted
      playsInline
      className="h-full w-full object-cover"
      aria-label={alt}
    />
  );
}

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

type PaseKey = 'primer' | 'segundo' | 'postre';
const PASE_LABELS: Record<PaseKey, string> = { primer: '1er pase', segundo: '2º pase', postre: 'Postre' };
const PASE_COLORS: Record<PaseKey, { bg: string; text: string; border: string }> = {
  primer:  { bg: 'oklch(24% 0.14 45)',  text: 'oklch(82% 0.20 45)',  border: 'oklch(52% 0.22 45 / 0.7)'  },
  segundo: { bg: 'oklch(22% 0.12 252)', text: 'oklch(78% 0.18 252)', border: 'oklch(50% 0.20 252 / 0.7)' },
  postre:  { bg: 'oklch(22% 0.12 148)', text: 'oklch(76% 0.20 148)', border: 'oklch(48% 0.22 148 / 0.7)' },
};

function notePreviewText(note: string, showNote: boolean): string {
  if (!note || showNote) return '';
  return ` · ${note.length > 30 ? note.slice(0, 30) + '…' : note}`;
}

function resolveOpcionName(opcion: ComplementVM, language: string): string {
  const lang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as 'en' | 'fr' | 'it' | 'de' | undefined;
  if (lang && opcion.translations?.[lang]?.name) {
    return opcion.translations[lang].name;
  }
  return opcion.name;
}

// Opcion de complemento: seleccionada = borde y fondo suave del tenant.
function opcionClass(seleccionada: boolean): string {
  if (seleccionada) return "border-primary bg-primary/10"
  return "border-foreground/15 hover:border-foreground/40"
}

// "Obligatorio" sin completar se marca en el color del tenant; el resto, apagado.
function etiquetaGrupoClass(obligatorio: boolean, completo: boolean): string {
  if (obligatorio && !completo) return "text-primary"
  return "text-muted-foreground"
}

export function QuantitySelectorDialog(props: Readonly<QuantitySelectorDialogProps>) {
  const { item, open, onOpenChange } = props;
  const [quantity, setQuantity] = useState(1)
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, Set<string>>>({})
  const [addedAnimation, setAddedAnimation] = useState(false)
  const [selectedPase, setSelectedPase] = useState<PaseKey | null>(null)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const { language } = useLanguage()
  const { addItem } = useCart()

  const isWaiterMode = !!getWaiterMesa()

  useEffect(() => {
    if (open && item) {
      setQuantity(1);
      setSelectedByGroup({});

      setSelectedPase(null);
      setNote('');
      setShowNote(false);
      setIsImageZoomOpen(false);
      setActiveImageIndex(0);
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
    addItem(item, quantity, complementos, undefined, note.trim() || undefined, selectedPase ?? undefined);
    setAddedAnimation(true);
    setTimeout(() => {
      onOpenChange(false);
      setQuantity(1);
      setSelectedByGroup({});

      setSelectedPase(null);
      setNote('');
      setShowNote(false);
      setAddedAnimation(false);
    }, 300);
  }

  if (!item) return null

  const displayName = (language !== "es" && item.translations?.[language]?.name) || item.name;
  const displayDescription = resolveDescription(item, language);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-dvh overflow-hidden max-w-none sm:max-w-none rounded-none border-0 shadow-none flex flex-col p-0 gap-0 top-0 left-0 translate-x-0 translate-y-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        {item.image?.endsWith('.mp4') && (
          <div className="relative h-40 sm:h-48 w-full shrink-0 overflow-hidden bg-muted">
            <DialogVideo src={item.image} alt={displayName} />
          </div>
        )}
        {item.image && !item.image.endsWith('.mp4') && (
          <div className="shrink-0 bg-muted">
            <ProductImageGallery
              images={item.image2 ? [item.image, item.image2] : [item.image]}
              alt={displayName}
              objectFit={item.imageFit}
              mainImageClassName="relative h-40 sm:h-48 w-full overflow-hidden"
              sizes="100vw"
              onImageClick={() => setIsImageZoomOpen(true)}
              onIndexChange={setActiveImageIndex}
            />
          </div>
        )}
        {item.image && !item.image.endsWith('.mp4') && (
          <ImageZoomDialog
            open={isImageZoomOpen}
            onOpenChange={setIsImageZoomOpen}
            images={item.image2 ? [item.image, item.image2] : [item.image]}
            alt={displayName}
            objectFit={item.imageFit}
            initialIndex={activeImageIndex}
          />
        )}
        <DialogHeader className="px-5 pt-5 pb-4 shrink-0 border-b border-foreground/10">
          <DialogTitle className="font-serif text-2xl font-normal leading-tight tracking-[-0.02em] [font-variant-numeric:lining-nums] pr-8 [overflow-wrap:anywhere]">{displayName}</DialogTitle>
          {/* Radix exige un Description accesible (aria-describedby) para el
              Dialog; sin descripcion propia del producto usamos el nombre
              como fallback silencioso en vez de dejar el warning en consola. */}
          {displayDescription ? (
            <DialogDescription>{displayDescription}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{displayName}</DialogDescription>
          )}
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
                  <div key={grupo.id} className="mb-6">
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <span className="font-serif text-lg font-normal leading-tight">{grupo.name}</span>
                      <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] ${etiquetaGrupoClass(grupo.obligatorio, isComplete)}`}>
                        {getBadgeText(grupo)}
                      </span>
                    </div>
                    {/* Progreso: filete fino en el color del tenant, sin semaforo de colores fijos. */}
                    <div className="h-px mb-3 overflow-hidden bg-foreground/15">
                      <div
                        className="h-full bg-primary transition-[width] duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {grupo.opciones.map(opcion => {
                        const isSelected = selectedByGroup[grupo.id]?.has(opcion.id) ?? false;
                        const inputType = grupo.tipo === 'radio' ? 'radio' : 'checkbox';
                        const toggle = inputType === 'radio'
                          ? () => toggleRadio(grupo.id, opcion.id)
                          : () => toggleCheckbox(grupo.id, opcion.id);
                        return (
                          <label
                            key={opcion.id}
                            className={`flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-[3px] border px-3 py-2.5 text-left outline-none transition-colors [&:has(input:focus-visible)]:ring-2 [&:has(input:focus-visible)]:ring-ring [&:has(input:focus-visible)]:ring-offset-2 ${opcionClass(isSelected)}`}
                          >
                            <input
                              type={inputType}
                              checked={isSelected}
                              onChange={toggle}
                              className="w-4 h-4 accent-primary cursor-pointer"
                              aria-label={resolveOpcionName(opcion, language)}
                            />

                            <span className="flex-1 text-sm">{resolveOpcionName(opcion, language)}</span>
                            {opcion.price > 0 && (
                              <span className="text-xs font-semibold shrink-0 tabular-nums text-foreground">
                                +{formatPrice(opcion.price, 'EUR', language)}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <AllergenList alergenos={item.alergenos} language={language} />

          {item.table && <ProductTable table={item.table} language={language} />}

          <div className="space-y-3">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowNote(v => !v)}
              className={`w-full min-h-[44px] flex items-center gap-2 border-b px-0 py-2 text-sm font-medium transition-colors ${
                showNote
                  ? 'border-foreground/40 text-foreground'
                  : 'border-foreground/15 text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquarePlus className={`w-3.5 h-3.5 shrink-0 transition-colors ${showNote ? 'text-primary' : ''}`} />
              <span className="flex-1 text-left">{t("itemNote", language)}{notePreviewText(note, showNote)}</span>
              <ChevronUp className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${showNote ? 'rotate-0' : 'rotate-180'}`} />
            </button>
            {showNote && (
              <Textarea
                id="item-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("itemNotePlaceholder", language)}
                className="resize-none rounded-[3px] text-sm"
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
                className="h-11 w-11 rounded-[3px] md:h-10 md:w-10"
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
                className="mx-1 h-10 w-12 flex items-center justify-center rounded-[3px] border-0 text-center text-lg font-semibold tabular-nums shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                readOnly
                tabIndex={0}
                aria-live="polite"
                aria-label={t("quantity", language)}
              />
              <RippleButton variant="outline" size="icon" className="h-11 w-11 rounded-[3px] md:h-10 md:w-10" onClick={handleIncrement} aria-label={t("increaseQuantity", language)}>
                <Plus className="h-4 w-4" />
              </RippleButton>
            </div>
          </div>
          <div className="flex items-baseline justify-between border-t border-foreground/15 pt-4">
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("total", language)}</span>
            <span className="animate-price-update text-2xl font-semibold tabular-nums" key={totalPrice}>{formatPrice(totalPrice, 'EUR', language)}</span>
          </div>

          {isWaiterMode && item.tipoProducto !== 'bebida' && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Pase <span className="text-destructive">*</span>
            </p>
            <div className="flex gap-2">
              {(['primer', 'segundo', 'postre'] as PaseKey[]).map(p => {
                const pc = PASE_COLORS[p];
                const isSelected = selectedPase === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPase(prev => prev === p ? null : p)}
                    className="flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-all"
                    style={{
                      background: isSelected ? pc.bg : `color-mix(in oklch, ${pc.bg} 35%, transparent)`,
                      color: isSelected ? pc.text : `color-mix(in oklch, ${pc.text} 70%, var(--muted-foreground))`,
                      borderColor: isSelected ? pc.border : `color-mix(in oklch, ${pc.border} 50%, transparent)`,
                    }}
                  >
                    {PASE_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </div>
          )}
          </div>
        </div>

        <DialogFooter className="px-5 py-4 shrink-0 border-t border-foreground/10">
          <RippleButton
            type="button"
            onClick={handleConfirmAddToCart}
            disabled={!isGroupsValid(effectiveGroups, selectedByGroup) || addedAnimation || (isWaiterMode && item.tipoProducto !== 'bebida' && !selectedPase)}
            className={`min-h-[48px] w-full text-[15px] font-semibold rounded-[3px] bg-foreground text-background hover:bg-foreground/85 ${addedAnimation ? 'animate-complement-select' : ''}`}
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

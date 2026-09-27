"use client"

import { useState, memo, useCallback, useEffect, useRef } from "react"
import { ImagenSubida as Image } from './ui/imagen-subida';
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useLanguage, type Language } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { formatPrice } from "@/lib/format-price"
import { MenuCategoryVM, MenuItemVM, MenuSubcategoryVM } from "@/core/application/dtos/menu-view-model"
import { subcategoriasConProductos } from "@/lib/menu/subcategorias"
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog"
import { AllergenBadges, AllergenList } from "@/components/allergen-icons"
import { ImageZoomDialog } from "@/components/image-zoom-dialog"

type LanguageKey = 'en' | 'fr' | 'it' | 'de';

// Rejilla de productos: sin fundido escalonado al hacer scroll (la carta se
// lee, no se "revela"). `minmax(0,1fr)` para que un nombre largo no desborde.
const GRID_PRODUCTOS = "grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]";

function getComplementCategoryDisplay(
  lang: LanguageKey | undefined,
  name?: string,
  translations?: MenuCategoryVM['complementCategoryTranslations'],
): string | undefined {
  if (lang && translations?.[lang]) return translations[lang];
  return name;
}

interface MenuSectionProps {
  category: MenuCategoryVM
  showCart?: boolean
  priority?: boolean
  hideImages?: boolean
}

export const MenuSection = memo(function MenuSection(props: Readonly<MenuSectionProps>) {
  const { category, showCart, priority = false, hideImages = false } = props;
  const { language } = useLanguage();
  const [selectedItem, setSelectedItem] = useState<MenuItemVM | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MenuItemVM | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleItemClick = useCallback((item: MenuItemVM) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  }, []);

  const handleDetailClick = useCallback((item: MenuItemVM) => {
    setDetailItem(item);
    setIsDetailOpen(true);
  }, []);

  const isCategoryWithComplements = category.items.some((item) => (item.complements && item.complements.length > 0) || (item.complementGroups && item.complementGroups.length > 0));
  const translationLang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as LanguageKey | undefined;

  const displayDescripcion = translationLang && category.descripcionTranslations?.[translationLang]
    ? category.descripcionTranslations[translationLang]
    : category.descripcion;

  // Calculado una vez — se lee tanto para decidir la rama como para el .map().
  const subcategoriasVisibles = subcategoriasConProductos(category);

  return (
    <section id={category.id} className="scroll-mt-20 sm:scroll-mt-32">
      {/* Filete fino encima del titular: el corte entre categorias es la linea, no una tarjeta. */}
      <div className="mb-8 border-t border-foreground/15 pt-6">
        <h2 className="min-w-0 font-serif text-[clamp(30px,4vw,52px)] font-normal leading-[1.05] tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">
          {(translationLang && category.translations?.[translationLang]?.name) || category.label}
        </h2>
        {displayDescripcion && (
          <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
            {displayDescripcion}
          </p>
        )}
      </div>

      {isCategoryWithComplements && category.complementoDeId && (
        <p className="mb-4 text-sm text-muted-foreground">
          {t("selectOptionalComplements", language)}
        </p>
      )}

      {subcategoriasVisibles.length > 0 ? (
        <div className="space-y-14">
          {subcategoriasVisibles.map((subcat, subIndex) => (
            <SubcategorySection
              key={subcat.id}
              subcategory={subcat}
              translationLang={translationLang}
              onItemClick={handleItemClick}
              onDetailClick={handleDetailClick}
              showCart={showCart}
              complementCategoryName={category.complementCategoryName}
              complementCategoryTranslations={category.complementCategoryTranslations}
              hideImages={hideImages}
              priority={priority && subIndex === 0}
            />
          ))}
        </div>
      ) : (
        <div className={GRID_PRODUCTOS}>
          {category.items.map((item, index) => (
            <div key={item.id} className="h-full min-w-0">
              <MenuItemCard
                item={item}
                language={translationLang}
                onItemClick={handleItemClick}
                onDetailClick={handleDetailClick}
                showCart={showCart}
                priority={priority && index < 3}
                complementCategoryName={category.complementCategoryName}
                complementCategoryTranslations={category.complementCategoryTranslations}
                hideImages={hideImages}
              />
            </div>
          ))}
        </div>
      )}

      <QuantitySelectorDialog
        item={selectedItem}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />

      <ItemDetailDialog
        item={detailItem}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        language={translationLang}
        complementCategoryName={category.complementCategoryName}
        complementCategoryTranslations={category.complementCategoryTranslations}
      />
    </section>
  );
})

const SubcategorySection = memo(function SubcategorySection(props: Readonly<{
  subcategory: MenuSubcategoryVM;
  translationLang: LanguageKey | undefined;
  onItemClick: (item: MenuItemVM) => void;
  onDetailClick: (item: MenuItemVM) => void;
  showCart?: boolean;
  complementCategoryName?: string;
  complementCategoryTranslations?: MenuCategoryVM['complementCategoryTranslations'];
  hideImages?: boolean;
  priority?: boolean;
}>) {
  const { subcategory, translationLang, onItemClick, onDetailClick, showCart, complementCategoryName, complementCategoryTranslations, hideImages = false, priority = false } = props;

  const displayDescripcion = translationLang && subcategory.descripcionTranslations?.[translationLang]
    ? subcategory.descripcionTranslations[translationLang]
    : subcategory.descripcion;

  return (
    <div id={subcategory.id} className="scroll-mt-20 sm:scroll-mt-32">
      <div className="mb-6">
        <h3 className="min-w-0 font-serif text-[clamp(22px,2.4vw,30px)] font-normal leading-tight tracking-[-0.015em] text-foreground [overflow-wrap:anywhere]">
          {(translationLang && subcategory.translations?.[translationLang]?.name) || subcategory.nombre}
        </h3>
        {displayDescripcion && (
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            {displayDescripcion}
          </p>
        )}
      </div>
      <div className={GRID_PRODUCTOS}>
        {subcategory.products.map((item, index) => (
          <div key={item.id} className="h-full min-w-0">
            <MenuItemCard
              item={item}
              language={translationLang}
              onItemClick={onItemClick}
              onDetailClick={onDetailClick}
              showCart={showCart}
              priority={priority && index < 3}
              complementCategoryName={complementCategoryName}
              complementCategoryTranslations={complementCategoryTranslations}
              hideImages={hideImages}
            />
          </div>
        ))}
      </div>
    </div>
  );
})

function getTranslatedField(
  language: LanguageKey | undefined,
  translations: MenuItemVM['translations'],
  field: 'name' | 'description',
  fallback: string,
): string {
  if (language && translations?.[language]?.[field]) return translations[language][field];
  return fallback;
}

function getCardAriaLabel(showCart: boolean | undefined, safeLanguage: Language, displayName: string): string {
  if (showCart) return `${t("addToCart", safeLanguage)}: ${displayName}`;
  return `${t("viewOptions", safeLanguage)}: ${displayName}`;
}

function CardMedia({ item, displayName, priority, onError, shouldReduceMotion }: Readonly<{
  item: MenuItemVM;
  displayName: string;
  priority: boolean;
  onError: () => void;
  shouldReduceMotion: boolean;
}>) {
  if (item.image?.endsWith(".mp4")) {
    return (
      <video
        src={item.image}
        autoPlay={!shouldReduceMotion}
        loop={!shouldReduceMotion}
        muted
        playsInline
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23f3f4f6'/%3E%3Cstop offset='100%25' stop-color='%23d1d5db'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='320' height='180'/%3E%3Ccircle cx='160' cy='90' r='30' fill='%239ca3af' opacity='0.5'/%3E%3Cpath d='M150 75 L185 90 L150 105 Z' fill='%23fff' opacity='0.7'/%3E%3C/svg%3E"
        className="absolute inset-0 w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:md:group-hover:scale-105"
        onError={onError}
        aria-label={displayName}
      />
    );
  }
  const objectFit = item.imageFit || 'contain';
  return (
    <Image
      src={item.image!}
      alt={displayName}
      fill
      className={`object-${objectFit} motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:md:group-hover:scale-105`}
      loading={priority ? "eager" : "lazy"}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      onError={onError}
    />
  );
}

// Filete del marco de la foto: casi invisible en reposo y en el color del
// tenant al pasar el raton (solo si la card es clicable). Va en un ::after por
// ENCIMA de la foto — un borde o ring del propio contenedor quedaria tapado
// por la imagen, que lo llena entero.
function marcoFotoClass(clicable: boolean | undefined): string {
  const base = "after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:border after:border-foreground/10 after:content-['']";
  if (clicable) return `${base} after:transition-colors after:duration-300 group-hover:after:border-primary`;
  return base;
}

const MenuItemCard = memo(function MenuItemCard(props: Readonly<{
  item: MenuItemVM;
  language: LanguageKey | undefined;
  onItemClick: (item: MenuItemVM) => void;
  onDetailClick: (item: MenuItemVM) => void;
  showCart?: boolean;
  priority?: boolean;
  complementCategoryName?: string;
  complementCategoryTranslations?: MenuCategoryVM['complementCategoryTranslations'];
  hideImages?: boolean;
}>) {
  const { item, language, onItemClick, onDetailClick, showCart, priority = false, complementCategoryName, complementCategoryTranslations, hideImages = false } = props;
  const { language: appLanguage } = useLanguage();
  const safeLanguage = appLanguage || "es";
  const [imageError, setImageError] = useState(false);
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);

  // Use static value initially, check on client only after mount
  const [shouldReduceMotionCard, setShouldReduceMotionCard] = useState(false);
  const cardMotionRef = useRef(false);

  useEffect(() => {
    if (!cardMotionRef.current) {
      cardMotionRef.current = true;
      const prefersReducedMotion = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setShouldReduceMotionCard(prefersReducedMotion);
    }
  }, []);

  const hasComplements = (item.complements && item.complements.length > 0) || (item.complementGroups && item.complementGroups.length > 0);
  const isClickable = showCart || hasComplements;

  const displayName = getTranslatedField(language, item.translations, 'name', item.name);
  const displayDescription = getTranslatedField(language, item.translations, 'description', item.description ?? '');

  const complementLabel = getComplementCategoryDisplay(language, complementCategoryName, complementCategoryTranslations)
    || t("complementsAvailable", safeLanguage);

  const minComplementPrice = (item.complements && item.complements.length > 0)
    ? Math.min(...item.complements.map((c) => c.price))
    : 0;

  const handleClick = () => {
    if (showCart || (item.complementGroups && item.complementGroups.length > 0)) {
      onItemClick(item);
    } else if (hasComplements) {
      onDetailClick(item);
    }
  };

  return (
    <div className={`group relative flex h-full flex-col ${isClickable ? "cursor-pointer" : ""}`}>
      {isClickable && (
        <button
          type="button"
          aria-label={getCardAriaLabel(showCart, safeLanguage, displayName)}
          className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
        />
      )}
      {item.image && !imageError && !hideImages && (
        <div className={`relative mb-4 aspect-[4/3] w-full overflow-hidden bg-muted ${marcoFotoClass(isClickable)}`}>
          <CardMedia item={item} displayName={displayName} priority={priority} onError={() => setImageError(true)} shouldReduceMotion={shouldReduceMotionCard} />
          {!item.image.endsWith(".mp4") && (
            <button
              type="button"
              aria-label={`${t("viewImage", safeLanguage)}: ${displayName}`}
              className="absolute inset-0 z-20 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={(e) => {
                e.stopPropagation();
                setIsImageZoomOpen(true);
              }}
            />
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col">
        {item.highlight && (
          <Badge variant="secondary" className="mb-1.5 w-fit rounded-none bg-transparent p-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary shadow-none">
            {t("especial", safeLanguage)}
          </Badge>
        )}
        <h3 className="mb-1.5 min-w-0 [font-variant-numeric:lining-nums] font-serif text-[clamp(20px,1.8vw,24px)] font-normal leading-snug tracking-[-0.01em] text-foreground [overflow-wrap:anywhere] decoration-primary decoration-1 underline-offset-[5px] group-hover:underline">
          {displayName}
        </h3>
        {displayDescription && (
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
            {displayDescription}
          </p>
        )}
        <AllergenBadges alergenos={item.alergenos} language={safeLanguage} className="mb-2" />
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-foreground/15 pt-3">
          <span className="text-base font-semibold tabular-nums text-foreground">
            {formatPrice(item.price, 'EUR', safeLanguage)}
          </span>
          {showCart && (
            <button
              type="button"
              className="relative z-20 min-h-[44px] shrink-0 whitespace-nowrap rounded-[3px] border border-foreground bg-foreground px-4 py-2 text-sm font-semibold text-background outline-none transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/85 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(item);
              }}
              aria-label={`${t("addToCart", safeLanguage)} ${displayName}`}
            >
              {t("addToCart", safeLanguage)}
            </button>
          )}
        </div>
        {!showCart && hasComplements && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-foreground/10 pt-3">
            <span className="text-sm text-muted-foreground min-w-0">
              <span className="break-words">{complementLabel}</span>
              {minComplementPrice > 0 && (
                <span className="ml-1.5 text-foreground/70 font-medium whitespace-nowrap">
                  {t("from", safeLanguage)} +{formatPrice(minComplementPrice, 'EUR', safeLanguage)}
                </span>
              )}
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
          </div>
        )}
      </div>
      {item.image && !item.image.endsWith(".mp4") && (
        <ImageZoomDialog
          open={isImageZoomOpen}
          onOpenChange={setIsImageZoomOpen}
          images={item.image2 ? [item.image, item.image2] : [item.image]}
          alt={displayName}
        />
      )}
    </div>
  );
})

/* ─── Complements Detail Dialog (non-cart mode) ─── */

function ItemDetailDialog(props: Readonly<{
  item: MenuItemVM | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: LanguageKey | undefined;
  complementCategoryName?: string;
  complementCategoryTranslations?: MenuCategoryVM['complementCategoryTranslations'];
}>) {
  const { item, open, onOpenChange, language, complementCategoryName, complementCategoryTranslations } = props;
  const { language: appLanguage } = useLanguage();
  const safeLanguage = appLanguage || "es";

  if (!item) return null;

  const complements = item.complements || [];
  const title = getComplementCategoryDisplay(language, complementCategoryName, complementCategoryTranslations)
    || t("complementsAvailable", safeLanguage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        className="sm:max-w-[425px] flex flex-col max-h-[calc(100dvh-2rem)] rounded-[3px] shadow-none"
        onPointerDownOutside={() => onOpenChange(false)}
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-serif text-2xl font-normal leading-tight tracking-[-0.02em] [font-variant-numeric:lining-nums] pr-8">{title}</DialogTitle>
          <DialogDescription>
            {complements.length} {complements.length === 1
              ? t("optionSingular", safeLanguage)
              : t("optionPlural", safeLanguage)}
          </DialogDescription>
        </DialogHeader>

        {complements.length > 0 && (
          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-2">
            {complements.map((comp) => {
              const compName = language && comp.translations?.[language]?.name
                ? comp.translations[language].name
                : comp.name;
              const compDesc = language && comp.translations?.[language]?.description
                ? comp.translations[language].description
                : comp.description;

              return (
                <div
                  key={comp.id}
                  className="flex items-center justify-between border-b border-foreground/10 py-3 last:border-0"
                >
                  <div className="text-left min-w-0">
                    <p className="font-medium text-sm">{compName}</p>
                    {compDesc && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{compDesc}</p>
                    )}
                  </div>
                  <span className="font-semibold text-sm tabular-nums shrink-0 ml-3">
                    +{formatPrice(comp.price, 'EUR', safeLanguage)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <AllergenList alergenos={item.alergenos} language={safeLanguage} />
      </DialogContent>
    </Dialog>
  );
}

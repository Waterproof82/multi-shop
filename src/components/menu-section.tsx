"use client"

import { useState, memo, useCallback } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { MenuCategoryVM, MenuItemVM, MenuSubcategoryVM } from "@/core/application/dtos/menu-view-model"
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog"

type LanguageKey = 'en' | 'fr' | 'it' | 'de';

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
}

export const MenuSection = memo(function MenuSection(props: Readonly<MenuSectionProps>) {
  const { category, showCart, priority = false } = props;
  const { language } = useLanguage();
  const [selectedItem, setSelectedItem] = useState<MenuItemVM | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MenuItemVM | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion() ?? false;

  const containerVariants = shouldReduceMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0 } },
      };

  const itemVariants = shouldReduceMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
      };

  const handleItemClick = useCallback((item: MenuItemVM) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  }, []);

  const handleDetailClick = useCallback((item: MenuItemVM) => {
    setDetailItem(item);
    setIsDetailOpen(true);
  }, []);

  const isCategoryWithComplements = category.items.some((item) => item.complements && item.complements.length > 0);
  const translationLang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as LanguageKey | undefined;

  const displayDescripcion = translationLang && category.descripcionTranslations?.[translationLang]
    ? category.descripcionTranslations[translationLang]
    : category.descripcion;

  return (
    <section id={category.id} className="scroll-mt-32">
      <div className="mb-5 flex items-center gap-4 overflow-hidden">
        <h2 className="font-serif text-2xl font-semibold text-foreground md:text-3xl tracking-tight truncate shrink min-w-0">
          {(translationLang && category.translations?.[translationLang]?.name) || category.label}
        </h2>
        <div className="h-px flex-1 bg-border shrink-0" />
      </div>

      {displayDescripcion && (
        <p className="mb-6 text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-4">
          {displayDescripcion}
        </p>
      )}

      {isCategoryWithComplements && category.complementoDeId && (
        <p className="mb-4 text-sm text-muted-foreground">
          {t("selectOptionalComplements", language)}
        </p>
      )}

      {category.subcategories && category.subcategories.length > 0 ? (
        <div className="space-y-8">
          {category.subcategories.map((subcat) => (
            <SubcategorySection
              key={subcat.id}
              subcategory={subcat}
              translationLang={translationLang}
              onItemClick={handleItemClick}
              onDetailClick={handleDetailClick}
              showCart={showCart}
              shouldReduceMotion={shouldReduceMotion}
              complementCategoryName={category.complementCategoryName}
              complementCategoryTranslations={category.complementCategoryTranslations}
            />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
        >
          {category.items.map((item, index) => (
            <motion.div
              key={item.id}
              variants={itemVariants}
              className="h-full min-w-0"
            >
              <MenuItemCard
                item={item}
                language={translationLang}
                onItemClick={handleItemClick}
                onDetailClick={handleDetailClick}
                showCart={showCart}
                priority={priority && index < 3}
                complementCategoryName={category.complementCategoryName}
                complementCategoryTranslations={category.complementCategoryTranslations}
              />
            </motion.div>
          ))}
        </motion.div>
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
  shouldReduceMotion?: boolean;
  complementCategoryName?: string;
  complementCategoryTranslations?: MenuCategoryVM['complementCategoryTranslations'];
}>) {
  const { subcategory, translationLang, onItemClick, onDetailClick, showCart, shouldReduceMotion = false, complementCategoryName, complementCategoryTranslations } = props;

  const subContainerVariants = shouldReduceMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      };

  const subVariants = shouldReduceMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
      };

  const displayDescripcion = translationLang && subcategory.descripcionTranslations?.[translationLang]
    ? subcategory.descripcionTranslations[translationLang]
    : subcategory.descripcion;

  return (
    <div className="space-y-3">
      <h3 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
        <span className="min-w-0 break-words">{(translationLang && subcategory.translations?.[translationLang]?.name) || subcategory.nombre}</span>
      </h3>
      {displayDescripcion && (
        <p className="text-sm text-muted-foreground border-l-2 border-primary/20 pl-3">
          {displayDescripcion}
        </p>
      )}
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        variants={subContainerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
      >
        {subcategory.products.map((item) => (
          <motion.div
            key={item.id}
            variants={subVariants}
            className="h-full min-w-0"
          >
            <MenuItemCard
              item={item}
              language={translationLang}
              onItemClick={onItemClick}
              onDetailClick={onDetailClick}
              showCart={showCart}
              complementCategoryName={complementCategoryName}
              complementCategoryTranslations={complementCategoryTranslations}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
})

const MenuItemCard = memo(function MenuItemCard(props: Readonly<{
  item: MenuItemVM;
  language: LanguageKey | undefined;
  onItemClick: (item: MenuItemVM) => void;
  onDetailClick: (item: MenuItemVM) => void;
  showCart?: boolean;
  priority?: boolean;
  complementCategoryName?: string;
  complementCategoryTranslations?: MenuCategoryVM['complementCategoryTranslations'];
}>) {
  const { item, language, onItemClick, onDetailClick, showCart, priority = false, complementCategoryName, complementCategoryTranslations } = props;
  const { language: appLanguage } = useLanguage();
  const safeLanguage = appLanguage || "es";
  const [imageError, setImageError] = useState(false);
  const hasComplements = item.complements && item.complements.length > 0;
  const isClickable = showCart || (!showCart && hasComplements);

  const displayName = language && item.translations?.[language]?.name
    ? item.translations[language].name
    : item.name;
  const displayDescription = language && item.translations?.[language]?.description
    ? item.translations[language].description
    : item.description;

  const complementLabel = getComplementCategoryDisplay(language, complementCategoryName, complementCategoryTranslations)
    || t("complementsAvailable", safeLanguage);

  const minComplementPrice = hasComplements
    ? Math.min(...item.complements!.map((c) => c.price))
    : 0;

  const handleClick = () => {
    if (showCart) {
      onItemClick(item);
    } else if (hasComplements) {
      onDetailClick(item);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden rounded-lg bg-card border transition-[box-shadow,transform,border-color] duration-200 hover:shadow-elegant hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        isClickable ? "cursor-pointer" : ""
      } ${
        item.highlight ? "border-primary/25 ring-1 ring-primary/10" : "border-border"
      }`}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? (showCart ? `${t("addToCart", safeLanguage)}: ${displayName}` : `${t("viewOptions", safeLanguage)}: ${displayName}`) : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      onClick={isClickable ? handleClick : undefined}
    >
      {item.image && !imageError && (
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {item.image.endsWith(".mp4") ? (
            <video
              src={item.image}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 md:group-hover:scale-105"
              onError={() => setImageError(true)}
            />
          ) : (
            <img
              src={item.image}
              alt={displayName}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 md:group-hover:scale-105"
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              onError={() => setImageError(true)}
            />
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="font-serif text-lg font-semibold text-foreground leading-snug truncate flex-1 min-w-0">
            {displayName}
          </h3>
          {item.highlight && (
            <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] shrink-0">
              {t("especial", safeLanguage)}
            </Badge>
          )}
        </div>
        {displayDescription && (
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
            {displayDescription}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-border/50">
          <span className="text-lg font-bold text-foreground tabular-nums">
            {item.price.toFixed(2).replace(".", ",")}€
          </span>
          {showCart && (
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 rounded-md px-3.5 py-2 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring transition-all duration-150 min-h-[44px] shrink-0 whitespace-nowrap"
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
          <div className="flex items-center justify-between gap-2 mt-3 p-2.5 rounded-md bg-muted/50 group-hover:bg-muted transition-colors duration-200">
            <span className="text-sm text-muted-foreground min-w-0">
              <span className="break-words">{complementLabel}</span>
              {minComplementPrice > 0 && (
                <span className="ml-1.5 text-foreground/70 font-medium whitespace-nowrap">
                  {t("from", safeLanguage)} +{minComplementPrice.toFixed(2).replace(".", ",")}€
                </span>
              )}
            </span>
            <ChevronRight className="w-4 h-4 text-primary shrink-0 transition-colors duration-200" />
          </div>
        )}
      </div>
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
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="sm:max-w-[425px] flex flex-col max-h-[calc(100dvh-2rem)]"
        onPointerDownOutside={() => onOpenChange(false)}
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
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
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div className="text-left min-w-0">
                    <p className="font-medium text-sm">{compName}</p>
                    {compDesc && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{compDesc}</p>
                    )}
                  </div>
                  <span className="font-semibold text-sm shrink-0 ml-3">
                    +{comp.price.toFixed(2).replace(".", ",")}€
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

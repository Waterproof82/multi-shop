"use client"

import { useState, memo, useCallback } from "react"
import { motion, useReducedMotion } from "framer-motion"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { MenuCategoryVM, MenuItemVM, MenuSubcategoryVM } from "@/core/application/dtos/menu-view-model"
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog"

type LanguageKey = 'en' | 'fr' | 'it' | 'de';

interface MenuSectionProps {
  category: MenuCategoryVM
  showCart?: boolean
}

export const MenuSection = memo(function MenuSection(props: Readonly<MenuSectionProps>) {
  const { category, showCart } = props;
  const { language } = useLanguage();
  const [selectedItem, setSelectedItem] = useState<MenuItemVM | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion() ?? false;

  const itemVariants = shouldReduceMotion
    ? { initial: {}, whileInView: {} }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
      };

  const handleItemClick = useCallback((item: MenuItemVM) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  }, []);

  const isCategoryWithComplements = category.items.some((item) => item.complements && item.complements.length > 0);
  const translationLang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as LanguageKey | undefined;

  const displayDescripcion = translationLang && category.descripcionTranslations?.[translationLang]
    ? category.descripcionTranslations[translationLang]
    : category.descripcion;

  return (
    <section id={category.id} className="scroll-mt-32" style={{ scrollMarginTop: '8rem' }}>
      <div className="mb-5 flex items-center gap-4">
        <h2 className="font-serif text-2xl font-semibold text-foreground md:text-3xl tracking-tight">
          {(translationLang && category.translations?.[translationLang]?.name) || category.label}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {displayDescripcion && (
        <p className="mb-6 text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-4">
          {displayDescripcion}
        </p>
      )}

      {isCategoryWithComplements && category.complementoDeId && (
        <p className="mb-4 text-sm text-muted-foreground">
          Selecciona los complementos opcionales al añadir productos.
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
              showCart={showCart}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {category.items.map((item, index) => (
            <motion.div
              key={item.id}
              variants={itemVariants}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.35, delay: shouldReduceMotion ? 0 : Math.min(index * 0.06, 0.3) }}
              className="h-full"
            >
              <MenuItemCard
                item={item}
                language={translationLang}
                onItemClick={handleItemClick}
                showCart={showCart}
              />
            </motion.div>
          ))}
        </div>
      )}

      <QuantitySelectorDialog
        item={selectedItem}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </section>
  );
})

const SubcategorySection = memo(function SubcategorySection(props: Readonly<{
  subcategory: MenuSubcategoryVM;
  translationLang: LanguageKey | undefined;
  onItemClick: (item: MenuItemVM) => void;
  showCart?: boolean;
  shouldReduceMotion?: boolean;
}>) {
  const { subcategory, translationLang, onItemClick, showCart, shouldReduceMotion = false } = props;

  const subVariants = shouldReduceMotion
    ? { initial: {}, whileInView: {} }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
      };

  const displayDescripcion = translationLang && subcategory.descripcionTranslations?.[translationLang]
    ? subcategory.descripcionTranslations[translationLang]
    : subcategory.descripcion;

  return (
    <div className="space-y-3">
      <h3 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
        {(translationLang && subcategory.translations?.[translationLang]?.name) || subcategory.nombre}
      </h3>
      {displayDescripcion && (
        <p className="text-sm text-muted-foreground border-l-2 border-primary/20 pl-3">
          {displayDescripcion}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subcategory.products.map((item, index) => (
          <motion.div
            key={item.id}
            variants={subVariants}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.35, delay: shouldReduceMotion ? 0 : Math.min(index * 0.06, 0.3) }}
            className="h-full"
          >
            <MenuItemCard
              item={item}
              language={translationLang}
              onItemClick={onItemClick}
              showCart={showCart}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
})

const MenuItemCard = memo(function MenuItemCard(props: Readonly<{
  item: MenuItemVM;
  language: LanguageKey | undefined;
  onItemClick: (item: MenuItemVM) => void;
  showCart?: boolean;
}>) {
  const { item, language, onItemClick, showCart } = props;
  const { language: appLanguage } = useLanguage();
  const safeLanguage = appLanguage || "es";
  const [imageError, setImageError] = useState(false);

  const displayName = language && item.translations?.[language]?.name
    ? item.translations[language].name
    : item.name;
  const displayDescription = language && item.translations?.[language]?.description
    ? item.translations[language].description
    : item.description;

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden rounded-lg bg-card border transition-all duration-200 hover:shadow-elegant hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        showCart ? "cursor-pointer" : ""
      } ${
        item.highlight ? "border-primary/25 ring-1 ring-primary/10" : "border-border"
      }`}
      role={showCart ? "button" : undefined}
      tabIndex={showCart ? 0 : undefined}
      onKeyDown={showCart ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onItemClick(item);
        }
      } : undefined}
      onClick={showCart ? () => onItemClick(item) : undefined}
    >
      {item.image && !imageError && (
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <Image
            key={item.id}
            src={item.image}
            alt={displayName}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 md:group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading="lazy"
            onError={() => setImageError(true)}
            suppressHydrationWarning
          />
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
              className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 rounded-md px-3.5 py-1.5 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring transition-all duration-150"
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
      </div>
    </div>
  );
})

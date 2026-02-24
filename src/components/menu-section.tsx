"use client"

import { useState, memo, useCallback } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { useLanguage, type Language } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { MenuCategoryVM, MenuItemVM, MenuSubcategoryVM } from "@/core/application/dtos/menu-view-model"
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog"

interface Complement {
  id: string;
  name: string;
  price: number;
  description?: string;
}

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

  const handleItemClick = useCallback((item: MenuItemVM) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  }, []);

  const isCategoryWithComplements = category.items.some((item) => item.complements && item.complements.length > 0);
  const translationLang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as LanguageKey | undefined;
  const safeLanguage: Language = language || "es";

  return (
    <section id={category.id} className="scroll-mt-32">
      <div className="mb-6 flex items-center gap-4">
        <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
          {(translationLang && category.translations?.[translationLang]) || category.label}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

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
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {category.items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
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
}>) {
  const { subcategory, translationLang, onItemClick, showCart } = props;

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary/50" />
        {(translationLang && subcategory.translations?.[translationLang]) || subcategory.nombre}
      </h3>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {subcategory.products.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
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
      className={`group flex h-full flex-col overflow-hidden rounded-xl bg-card shadow-sm transition-all hover:shadow-md border ${
        showCart ? "cursor-pointer" : ""
      } ${
        item.highlight ? "border-accent/30 bg-accent/5" : "border-border"
      }`}
    >
      {item.image && !imageError && (
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <Image
            key={item.id}
            src={item.image}
            alt={displayName}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading="eager"
            onError={() => setImageError(true)}
            suppressHydrationWarning
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-serif text-xl font-bold text-foreground">
            {displayName}
          </h3>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {item.highlight && (
              <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px]">
                Especial
              </Badge>
            )}
          </div>
        </div>
        {displayDescription && (
          <p className="mb-3 flex-1 text-sm leading-relaxed text-muted-foreground">
            {displayDescription}
          </p>
        )}
        <div className="flex-1" />
        {showCart && (
          <div className="flex items-center justify-between gap-3 pt-4 mt-auto">
            <span className="font-serif text-2xl font-bold text-foreground">
              {item.price.toFixed(2).replace(".", ",")}€
            </span>
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(item);
              }}
              aria-label={`${t("addToCart", safeLanguage)} ${displayName}`}
            >
              {t("addToCart", safeLanguage)}
            </button>
          </div>
        )}
        {!showCart && (
          <div className="flex items-center justify-between gap-3 pt-4 mt-auto">
            <span className="font-serif text-2xl font-bold text-foreground">
              {item.price.toFixed(2).replace(".", ",")}€
            </span>
          </div>
        )}
      </div>
    </div>
  );
})

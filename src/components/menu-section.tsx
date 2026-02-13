"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { useCart } from "@/lib/cart-context"
import { useLanguage } from "@/lib/language-context"
import { MenuCategoryVM, MenuItemVM } from "@/core/application/dtos/menu-view-model"
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog"
import { checkCartAuthorization } from "@/app/actions"
import { useToast } from "@/hooks/use-toast"
import { t } from "@/lib/translations"

type LanguageKey = 'en' | 'fr' | 'it' | 'de';

interface MenuSectionProps {
  category: MenuCategoryVM
  showCart?: boolean
}

export function MenuSection(props: Readonly<MenuSectionProps>) {
  const { category, showCart } = props;
  const { addItem } = useCart();
  const { language } = useLanguage() as { language: string };
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<MenuItemVM | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(showCart ?? false);

  useEffect(() => {
    setIsAuthorized(showCart ?? false);
  }, [showCart]);

  const handleItemClick = async (item: MenuItemVM) => {
    const authorized = await checkCartAuthorization();
    if (authorized) {
      setIsAuthorized(true);
      setSelectedItem(item);
      setIsDialogOpen(true);
    } else {
      setIsAuthorized(false);
      toast({
        variant: "destructive",
        title: t("sessionExpired", language),
      });
    }
  };

  const handleAddToCartWithQuantity = (item: MenuItemVM, quantity: number) => {
    addItem(item, quantity);
  };

  const isSalsas = category.label.toLowerCase() === "salsas";
  const translationLang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as LanguageKey | undefined;

  return (
    <section id={category.id} className="scroll-mt-32">
      <div className="mb-6 flex items-center gap-4">
        <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
          {(translationLang && category.translations?.[translationLang]) || category.label}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {isSalsas && (
        <p className="mb-4 text-sm text-muted-foreground">
          Elige tu salsa favorita para acompañar tu pasta. Pasta con salsa Frutti di Mare +2.50€
        </p>
      )}

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
              isSalsas={isSalsas}
              language={translationLang}
              onItemClick={handleItemClick}
              showCart={isAuthorized}
            />
          </motion.div>
        ))}
      </div>

      <QuantitySelectorDialog
        item={selectedItem}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onAddToCart={handleAddToCartWithQuantity}
      />
    </section>
  );
}

function MenuItemCard(props: Readonly<{
  item: MenuItemVM;
  isSalsas: boolean;
  language: LanguageKey | undefined;
  onItemClick: (item: MenuItemVM) => void;
  showCart?: boolean;
}>) {
  const { item, isSalsas, language, onItemClick, showCart } = props;
  const [imageError, setImageError] = useState(false);
  const [clientName, setClientName] = useState(item.name);
  const [clientDescription, setClientDescription] = useState(item.description || "");

  // Update name and description on client after mount to avoid hydration mismatch
  useEffect(() => {
    if (language && item.translations?.[language]?.name) {
      setClientName(item.translations[language].name);
    } else {
      setClientName(item.name);
    }
    if (language && item.translations?.[language]?.description) {
      setClientDescription(item.translations[language].description);
    } else {
      setClientDescription(item.description || "");
    }
  }, [language, item]);

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden rounded-xl bg-card shadow-sm transition-all hover:shadow-md border ${
        showCart ? "cursor-pointer" : "" // visual cue only
      } ${
        item.highlight ? "border-accent/30 bg-accent/5" : "border-border"
      }`}
      // No role/button/tabIndex for accessibility, only visual cue
    >
      {item.image && !imageError && (
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading="eager"
            onError={() => setImageError(true)}
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-serif text-xl font-bold text-foreground">
            {clientName}
          </h3>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {item.highlight && (
              <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px]">
                Especial
              </Badge>
            )}
          </div>
        </div>
        {clientDescription && (
          <p className="mb-3 flex-1 text-sm leading-relaxed text-muted-foreground">
            {clientDescription}
          </p>
        )}
        <div className="flex-1" />
        {!isSalsas && showCart && (
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
              aria-label={`Añadir ${clientName} al carrito`}
            >
              Añadir al carrito
            </button>
          </div>
        )}
        {!isSalsas && !showCart && (
          <div className="flex items-center justify-between gap-3 pt-4 mt-auto">
            <span className="font-serif text-2xl font-bold text-foreground">
              {item.price.toFixed(2).replace(".", ",")}€
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog";
import { ProductTable } from "@/components/producto/product-table";
import { SiteFooter } from "@/components/site-footer";
import { useCart } from "@/lib/cart-context";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";
import { hrefVolverACarta } from "@/lib/catalogo/ancla-producto";
import type { EmpresaPublic, ModalidadEntrega } from "@/core/domain/entities/types";
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model";

// Carga perezosa: solo hace falta cuando el carrito está activo, igual que en MenuPage.
const CartDrawer = dynamic(
  () => import("@/components/cart-drawer").then((mod) => ({ default: mod.CartDrawer })),
  { ssr: false }
);

type LanguageKey = "en" | "fr" | "it" | "de";

function asLanguageKey(language: string): LanguageKey | undefined {
  return (["en", "fr", "it", "de"].includes(language) ? language : undefined) as LanguageKey | undefined;
}

function nombreTraducido(item: MenuItemVM, language: string): string {
  const lang = asLanguageKey(language);
  return (lang && item.translations?.[lang]?.name) || item.name;
}

function descripcionTraducida(item: MenuItemVM, language: string): string | undefined {
  const lang = asLanguageKey(language);
  return (lang && item.translations?.[lang]?.description) || item.description;
}

function necesitaSelector(item: MenuItemVM): boolean {
  return (item.complements?.length ?? 0) > 0 || (item.complementGroups?.length ?? 0) > 0;
}

interface ProductDetailClientProps {
  empresa: EmpresaPublic;
  item: MenuItemVM;
  header?: ReactNode;
  showCart: boolean;
  modalidadesEntrega: ModalidadEntrega[];
}

export function ProductDetailClient({
  empresa,
  item,
  header,
  showCart,
  modalidadesEntrega,
}: Readonly<ProductDetailClientProps>) {
  const { language } = useLanguage();
  const { addItem } = useCart();
  const [dialogOpen, setDialogOpen] = useState(false);

  const displayName = nombreTraducido(item, language);
  const displayDescription = descripcionTraducida(item, language);
  const images = [item.image, item.image2].filter((src): src is string => Boolean(src));

  const handleAddToCart = () => {
    if (necesitaSelector(item)) {
      setDialogOpen(true);
      return;
    }
    addItem(item);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {header}
      <main id="main-content" className="flex-1">
        {/* Pegada bajo el header sticky (h-16 / md:h-20): volver siempre a mano al hacer scroll. */}
        <div className="sticky top-16 z-40 border-b border-foreground/10 bg-background md:top-20">
          <div className="mx-auto w-full max-w-3xl px-[clamp(16px,4vw,64px)]">
            <Link
              href={hrefVolverACarta(item.slug)}
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t("backToMenu", language)}
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl px-[clamp(16px,4vw,64px)] py-[clamp(24px,4vw,48px)]">

          {images.length > 0 && (
            <ProductImageGallery
              images={images}
              alt={displayName}
              objectFit={item.imageFit}
              mainImageClassName="relative aspect-square w-full overflow-hidden rounded-[2px] bg-white"
              sizes="(max-width: 768px) 100vw, 640px"
            />
          )}

          <h1 className="mt-6 font-serif text-[clamp(28px,5vw,44px)] font-normal leading-tight tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">
            {displayName}
          </h1>

          {displayDescription && (
            <p className="mt-3 max-w-[60ch] whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
              {displayDescription}
            </p>
          )}

          <p className="mt-6 text-2xl font-semibold tabular-nums">
            {formatPrice(item.price, empresa.moneda || "EUR", language)}
          </p>

          {showCart && (
            <button
              type="button"
              onClick={handleAddToCart}
              className="mt-6 min-h-[48px] w-full rounded-[3px] bg-foreground px-6 text-[15px] font-semibold text-background hover:bg-foreground/85 sm:w-auto sm:px-10"
            >
              {t("addToCart", language)}
            </button>
          )}

          {item.table && (
            <section className="mt-10">
              <h2 className="mb-3 font-serif text-[clamp(20px,3vw,26px)] font-normal leading-tight tracking-[-0.01em] text-foreground">
                {t("productTableSectionLabel", language)}
              </h2>
              <ProductTable table={item.table} language={language} />
            </section>
          )}
        </div>
      </main>
      <SiteFooter empresa={empresa} />
      {showCart && (
        <>
          <QuantitySelectorDialog item={item} open={dialogOpen} onOpenChange={setDialogOpen} />
          <CartDrawer
            isRestaurant={false}
            pagosPickupHabilitados={empresa.pagosPickupHabilitados}
            deliveryHabilitado={empresa.deliveryHabilitado}
            envioDomicilioHabilitado={empresa.envioDomicilioHabilitado}
            modalidadesEntrega={modalidadesEntrega}
          />
        </>
      )}
    </div>
  );
}

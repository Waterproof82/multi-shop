"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog";
import { ProductTable } from "@/components/producto/product-table";
import { SiteFooter } from "@/components/site-footer";
import { useCart } from "@/lib/cart-context";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";
import { precioUnitarioPeople } from "@/lib/catalogo/escala-people";
import { hrefVolverACarta } from "@/lib/catalogo/ancla-producto";
import type { EmpresaPublic, ModalidadEntrega } from "@/core/domain/entities/types";
import type { MenuItemVM, PeopleConfigVM } from "@/core/application/dtos/menu-view-model";

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

/** Personas inicial del configurador: la de la URL clampada a [min, max] (o min). */
function personasInicial(n: number | undefined, config: PeopleConfigVM | undefined): number {
  if (!config) return 1;
  if (n === undefined) return config.min;
  return Math.min(config.max, Math.max(config.min, n));
}

interface ProductDetailClientProps {
  empresa: EmpresaPublic;
  item: MenuItemVM;
  header?: ReactNode;
  showCart: boolean;
  modalidadesEntrega: ModalidadEntrega[];
  /** `?personas=N` resuelto por el server (page.tsx): preselección del configurador. */
  initialPersonas?: number;
}

export function ProductDetailClient({
  empresa,
  item,
  header,
  showCart,
  modalidadesEntrega,
  initialPersonas,
}: Readonly<ProductDetailClientProps>) {
  const { language } = useLanguage();
  const { addItem } = useCart();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Configurador de personas (kits). Sin peopleConfig es invisible: el estado
  // queda en 1 y ni el stepper ni el escalado de tabla se renderizan.
  const peopleConfig = item.peopleConfig;
  const [personas, setPersonas] = useState(() => personasInicial(initialPersonas, peopleConfig));

  const displayName = nombreTraducido(item, language);
  const displayDescription = descripcionTraducida(item, language);
  const images = [item.image, item.image2].filter((src): src is string => Boolean(src));
  // Precio vivo del configurador: base + paso × (N − min), ESPEJO del que
  // recalcula el server al cobrar (PedidoUseCase, siempre autoridad).
  const precioMostrado = peopleConfig
    ? precioUnitarioPeople(item.price, peopleConfig.pasoCents, peopleConfig.min, personas)
    : item.price;

  const handleAddToCart = () => {
    if (peopleConfig) {
      // Los kits con configurador no tienen grupos de complementos (verificado
      // en DB: producto_complemento_grupos = 0), así que el diálogo no aplica:
      // añadido directo. El ítem del carrito lleva el precio ESCALADO (para
      // que el total mostrado coincida con el cobro del server) y las
      // personas como campo propio: cada N es una línea de carrito distinta.
      addItem({ ...item, price: precioMostrado }, 1, undefined, undefined, undefined, undefined, personas);
      return;
    }
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
            {formatPrice(precioMostrado, empresa.moneda || "EUR", language)}
          </p>

          {showCart && peopleConfig && (
            <div className="mt-6 flex items-center gap-4">
              <span
                id="people-config-label"
                className="text-sm font-medium text-muted-foreground"
              >
                {t("peopleConfigLabel", language)}
              </span>
              <div
                className="flex items-center rounded-[3px] border border-border"
                role="group"
                aria-labelledby="people-config-label"
              >
                <button
                  type="button"
                  aria-label={t("reducePeople", language)}
                  disabled={personas <= peopleConfig.min}
                  onClick={() => setPersonas(p => Math.max(peopleConfig.min, p - 1))}
                  className="grid min-h-[44px] w-11 place-items-center text-foreground transition-colors hover:bg-muted/60 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <Minus aria-hidden="true" className="size-4" />
                </button>
                <span aria-live="polite" className="min-w-[3rem] text-center text-lg font-semibold tabular-nums text-foreground">
                  {personas}
                </span>
                <button
                  type="button"
                  aria-label={t("increasePeople", language)}
                  disabled={personas >= peopleConfig.max}
                  onClick={() => setPersonas(p => Math.min(peopleConfig.max, p + 1))}
                  className="grid min-h-[44px] w-11 place-items-center text-foreground transition-colors hover:bg-muted/60 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <Plus aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          )}

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
              <ProductTable table={item.table} language={language} peopleConfig={peopleConfig} personas={personas} />
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

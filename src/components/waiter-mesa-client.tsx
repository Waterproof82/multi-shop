"use client";

import { useEffect } from "react";
import { MesaIdContext } from "@/lib/mesa/use-mesa-id";
import { useCarritoPorMesa } from "@/lib/mesa/carrito-por-mesa";
import { useWaiterCatalog } from "@/lib/waiter-catalog-ctx";
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { MenuPage } from "@/components/client-menu-page";
import { SiteHeaderClient } from "@/components/site-header-client";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

interface WaiterMesaClientProps {
  readonly mesaId: string;
}

/**
 * Comanda del camarero para una mesa concreta. El catálogo viene del
 * `WaiterCatalogProvider` montado en `/waiter/layout.tsx` (fetch lazy, una
 * vez por sesión); esta página solo lo reclama al montar.
 *
 * Gate de doble condición antes de pintar el árbol de `MenuPage`: catálogo
 * listo Y carrito ya aislado para esta mesa (`useCarritoPorMesa`). Sin el
 * segundo, `MenuPage` podría sincronizar deferred de la mesa nueva con
 * items todavía en memoria de la mesa anterior.
 */
export function WaiterMesaClient({ mesaId }: WaiterMesaClientProps) {
  const { language } = useLanguage();
  const { status, empresa, menuData, ensureCatalog, refresh } = useWaiterCatalog();
  const carritoListo = useCarritoPorMesa(mesaId);

  useEffect(() => {
    ensureCatalog();
  }, [ensureCatalog]);

  if (status === "error" && !menuData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{t("waiterCatalogError", language)}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="min-h-11 px-4 py-2 rounded-md bg-primary text-primary-foreground"
          >
            {t("retry", language)}
          </button>
        </div>
      </div>
    );
  }

  if (!menuData || !carritoListo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{t("loading", language)}</p>
      </div>
    );
  }

  return (
    <MesaIdContext.Provider value={mesaId}>
      <EmpresaThemeProvider colores={empresa?.colores ?? null}>
        <MenuPage
          menuData={menuData}
          header={<SiteHeaderClient showCart empresa={empresa} />}
          showCart
          empresa={empresa}
          isWaiterMode
        />
      </EmpresaThemeProvider>
    </MesaIdContext.Provider>
  );
}

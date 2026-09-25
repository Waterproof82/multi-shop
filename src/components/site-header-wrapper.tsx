
'use server';
import { SiteHeaderClient } from './site-header-client';
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface SiteHeaderWrapperProps {
  showCart?: boolean;
  empresa?: EmpresaPublic | null;
  /** Muestra el enlace "Inicio" hacia la landing (solo en /carta). */
  mostrarVolverLanding?: boolean;
}

export default async function SiteHeaderWrapper(props: Readonly<SiteHeaderWrapperProps>) {
  const { showCart = false, empresa, mostrarVolverLanding = false } = props;
  return (
    <SiteHeaderClient
      key="site-header"
      showCart={showCart}
      empresa={empresa}
      mostrarVolverLanding={mostrarVolverLanding}
    />
  );
}

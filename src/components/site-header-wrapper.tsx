
'use server';
import { SiteHeaderClient } from './site-header-client';
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface SiteHeaderWrapperProps {
  showCart?: boolean;
  empresa?: EmpresaPublic | null;
  /** Muestra el enlace "Inicio" hacia la landing (solo en /carta). */
  mostrarVolverLanding?: boolean;
  /** URL absoluta o relativa del enlace "Inicio" (cross-domain en pedidos). */
  urlInicio?: string;
}

export default async function SiteHeaderWrapper(props: Readonly<SiteHeaderWrapperProps>) {
  const { showCart = false, empresa, mostrarVolverLanding = false, urlInicio = '/' } = props;
  return (
    <SiteHeaderClient
      key="site-header"
      showCart={showCart}
      empresa={empresa}
      mostrarVolverLanding={mostrarVolverLanding}
      urlInicio={urlInicio}
    />
  );
}

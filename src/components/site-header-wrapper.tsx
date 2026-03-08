
'use server';
import { SiteHeaderClient } from './site-header-client';
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface SiteHeaderWrapperProps {
  showCart?: boolean;
  empresa?: EmpresaPublic | null;
}

export default async function SiteHeaderWrapper(props: Readonly<SiteHeaderWrapperProps>) {
  const { showCart = false, empresa } = props;
  return <SiteHeaderClient key="site-header" showCart={showCart} empresa={empresa} />;
}

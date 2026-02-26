
'use server';
import { SiteHeaderClient } from './site-header-client';
import type { EmpresaInfo } from "@/lib/server-services";

interface SiteHeaderWrapperProps {
  showCart?: boolean;
  empresa?: EmpresaInfo | null;
}

export default async function SiteHeaderWrapper(props: Readonly<SiteHeaderWrapperProps>) {
  const { showCart = false, empresa } = props;
  return <SiteHeaderClient key="site-header" showCart={showCart} empresa={empresa} />;
}

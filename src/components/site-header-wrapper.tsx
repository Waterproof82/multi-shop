
'use server';
import { SiteHeaderClient } from './site-header-client';

interface SiteHeaderWrapperProps {
  showCart?: boolean;
}

export default async function SiteHeaderWrapper(props: SiteHeaderWrapperProps) {
  const { showCart = false } = props;
  return <SiteHeaderClient key="site-header" showCart={showCart} />;
}

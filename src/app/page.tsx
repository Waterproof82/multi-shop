import { getMenuUseCase } from "@/lib/server-services"
import { MenuPage } from "@/components/client-menu-page"
import SiteHeaderWrapper from "@/components/site-header-wrapper";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { jwtVerify } from 'jose';

export const revalidate = 3600;

import { cookies } from 'next/headers';

export default async function Home() {
  const empresaId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "demo-empresa-id";
  let menuData: MenuCategoryVM[] = [];
  const cookieStore = await cookies();
  let showCart = false;

  // JWT validation
  const accessToken = cookieStore.get('access_token');
  const secretKey = process.env.ACCESS_TOKEN_SECRET;
  if (accessToken && secretKey) {
    try {
      const secret = new TextEncoder().encode(secretKey);
      await jwtVerify(accessToken.value, secret);
      showCart = true;
    } catch (e) {
      showCart = false;
      console.error('JWT invalid or expired:', e);
    }
  }

  try {
    menuData = await getMenuUseCase.execute(empresaId);
    console.log("Menu data loaded successfully:", menuData.length);
  } catch (error) {
    console.error("Error fetching menu from Supabase:", error);
  }

  const header = await SiteHeaderWrapper();
  return <MenuPage menuData={menuData} header={header} showCart={showCart} />;
}

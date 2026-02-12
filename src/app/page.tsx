import { getMenuUseCase } from "@/lib/server-services"
import { MenuPage } from "@/components/client-menu-page"

export const revalidate = 3600;

export default async function Home() {
  const empresaId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "demo-empresa-id";
  let menuData = [];

  try {
    menuData = await getMenuUseCase.execute(empresaId);
    console.log("Menu data loaded successfully:", menuData.length);
  } catch (error) {
    console.error("Error fetching menu from Supabase:", error);
  }

  return <MenuPage menuData={menuData} />
}

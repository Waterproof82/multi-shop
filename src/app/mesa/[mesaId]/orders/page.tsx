import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MesaOrdersClient } from "@/components/mesa-orders-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ mesaId: string }>;
}

export default async function MesaOrdersPage({ params }: Props) {
  const { mesaId } = await params;
  const cookieStore = await cookies();
  const isWaiter = !!(cookieStore.get("waiter_token")?.value);
  return <MesaOrdersClient mesaId={mesaId} isWaiter={isWaiter} />;
}

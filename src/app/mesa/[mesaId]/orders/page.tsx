import type { Metadata } from "next";
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
  return <MesaOrdersClient mesaId={mesaId} />;
}

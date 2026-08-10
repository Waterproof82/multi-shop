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
  // El modo camarero lo resuelve el propio cliente comparando su mesa guardada
  // con esta. Aquí se leía además la cookie `waiter_token` para pasarlo como
  // prop, pero el componente nunca lo leía: era trabajo de servidor tirado.
  return <MesaOrdersClient mesaId={mesaId} />;
}

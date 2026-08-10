import type { Metadata } from "next";
import { WaiterMesaClient } from "@/components/waiter-mesa-client";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface Props {
  readonly params: Promise<{ mesaId: string }>;
}

export default async function WaiterMesaPage({ params }: Props) {
  const { mesaId } = await params;
  return <WaiterMesaClient mesaId={mesaId} />;
}

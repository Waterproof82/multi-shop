import { MesaOrdersClient } from "@/components/mesa-orders-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ mesaId: string }>;
}

export default async function MesaOrdersPage({ params }: Props) {
  const { mesaId } = await params;
  return <MesaOrdersClient mesaId={mesaId} />;
}

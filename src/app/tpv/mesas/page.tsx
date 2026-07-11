import { MesasGrid } from '@/components/tpv/MesasGrid';

export const dynamic = 'force-dynamic';

export default async function TpvMesasPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ seleccionar?: string }>;
}) {
  const { seleccionar } = await searchParams;
  const modo = seleccionar === '1' ? 'seleccionar' : 'cobrar';

  return <MesasGrid modo={modo} />;
}

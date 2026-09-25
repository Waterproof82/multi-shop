import { CartaRoute } from "@/components/carta-route";

export const dynamic = 'force-dynamic';

interface CartaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CartaPage({ searchParams }: Readonly<CartaPageProps>) {
  return <CartaRoute searchParams={searchParams} desdeRutaCarta />;
}

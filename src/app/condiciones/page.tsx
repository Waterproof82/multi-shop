import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { CondicionesContenido } from '@/components/legal/condiciones-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Condiciones de compra',
  alternates: { canonical: '/condiciones' },
};

export default async function CondicionesPage() {
  const ctx = await cargarContextoLegal('condiciones');
  return (
    <LegalPage titulo="Condiciones de compra">
      <CondicionesContenido ctx={ctx} />
    </LegalPage>
  );
}

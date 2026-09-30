import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { AvisoLegalContenido } from '@/components/legal/aviso-legal-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Aviso legal',
  alternates: { canonical: '/aviso-legal' },
};

export default async function AvisoLegalPage() {
  const ctx = await cargarContextoLegal('aviso-legal');
  return (
    <LegalPage titulo="Aviso legal">
      <AvisoLegalContenido ctx={ctx} />
    </LegalPage>
  );
}

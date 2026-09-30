import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { DevolucionesContenido } from '@/components/legal/devoluciones-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Devoluciones y garantía',
  alternates: { canonical: '/devoluciones' },
};

export default async function DevolucionesPage() {
  const ctx = await cargarContextoLegal('devoluciones');
  return (
    <LegalPage titulo="Devoluciones y garantía">
      <DevolucionesContenido ctx={ctx} />
    </LegalPage>
  );
}

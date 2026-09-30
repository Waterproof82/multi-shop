import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { EnviosContenido } from '@/components/legal/envios-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Envíos y pagos',
  alternates: { canonical: '/envios-y-pagos' },
};

export default async function EnviosPage() {
  const ctx = await cargarContextoLegal('envios-y-pagos');
  return (
    <LegalPage titulo="Envíos y pagos">
      <EnviosContenido ctx={ctx} />
    </LegalPage>
  );
}

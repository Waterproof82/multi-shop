import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-layout';
import { PrivacidadContenido } from '@/components/legal/privacidad-contenido';
import { cargarContextoLegal } from '@/lib/legal/cargar-contexto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  alternates: { canonical: '/privacidad' },
};

export default async function PrivacidadPage() {
  const ctx = await cargarContextoLegal('privacidad');
  return (
    <LegalPage titulo="Política de privacidad">
      <PrivacidadContenido ctx={ctx} />
    </LegalPage>
  );
}

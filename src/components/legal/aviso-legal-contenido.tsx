import Link from 'next/link';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { InfoTable, Section, TextoAdicional } from './legal-layout';

export function AvisoLegalContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { titular } = ctx;
  return (
    <>
      <Section titulo="1. Datos identificativos">
        <p>En cumplimiento del artículo 10 de la Ley 34/2002 (LSSI-CE), se informa de los datos del titular de este sitio web:</p>
        <InfoTable rows={[
          ['Titular', titular.nombre],
          titular.nif ? ['NIF/CIF', titular.nif] : null,
          titular.direccion ? ['Domicilio', titular.direccion] : null,
          titular.registroMercantil ? ['Registro Mercantil', titular.registroMercantil] : null,
          titular.email ? ['Email', titular.email] : null,
          titular.telefono ? ['Teléfono', titular.telefono] : null,
        ]} />
      </Section>

      <Section titulo="2. Condiciones de uso">
        <p>El acceso a este sitio web implica la aceptación de estas condiciones. El usuario se compromete a hacer un uso adecuado de los contenidos y a no emplearlos para actividades ilícitas o contrarias a la buena fe.</p>
      </Section>

      <Section titulo="3. Propiedad intelectual e industrial">
        <p>Los contenidos de este sitio (textos, fotografías, logotipos y diseño) pertenecen a {titular.nombre} o a terceros que han autorizado su uso. Queda prohibida su reproducción, distribución o transformación sin autorización expresa.</p>
      </Section>

      <Section titulo="4. Responsabilidad">
        <p>El titular no se hace responsable de los daños derivados de interrupciones del servicio, errores de acceso o contenidos de sitios de terceros enlazados desde esta web. Se compromete a retirar cualquier contenido ilícito en cuanto tenga conocimiento de él.</p>
      </Section>

      <Section titulo="5. Protección de datos">
        <p>El tratamiento de datos personales se rige por la <Link href="/privacidad" className="underline">política de privacidad</Link>.</p>
      </Section>

      <Section titulo="6. Legislación aplicable y jurisdicción">
        <p>Estas condiciones se rigen por la legislación española. Para cualquier controversia con consumidores serán competentes los juzgados y tribunales del domicilio del consumidor.</p>
      </Section>

      <TextoAdicional texto={ctx.legal.adicionalAvisoLegal} />
    </>
  );
}

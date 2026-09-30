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
        <p>El acceso a este sitio web es libre y gratuito y atribuye la condición de usuario, que se compromete a hacer un uso adecuado de los contenidos conforme a la ley y a la buena fe, a no emplearlos para actividades ilícitas o que dañen derechos de terceros o el funcionamiento del sitio, y a facilitar datos veraces en los formularios.</p>
        <p>El titular puede modificar en cualquier momento la presentación y los contenidos del sitio.</p>
      </Section>

      <Section titulo="3. Contenidos de los usuarios">
        <p>Las valoraciones, comentarios u otros contenidos que publiquen los usuarios son responsabilidad de su autor y no reflejan la opinión del titular. El titular podrá retirar, sin previo aviso, los que sean ilícitos, ofensivos, discriminatorios, publicitarios (spam), que vulneren derechos de terceros o que no guarden relación con el establecimiento.</p>
      </Section>

      <Section titulo="4. Propiedad intelectual e industrial">
        <p>Los contenidos de este sitio (textos, fotografías, logotipos y diseño) pertenecen a {titular.nombre} o a terceros que han autorizado su uso. Queda prohibida su reproducción, distribución o transformación sin autorización expresa.</p>
      </Section>

      <Section titulo="5. Responsabilidad">
        <p>El titular procura el buen funcionamiento del sitio, pero no garantiza que el acceso sea ininterrumpido o esté libre de errores, ni se hace responsable de los daños derivados de interrupciones del servicio o fallos de las telecomunicaciones ajenos a su control. Se compromete a retirar cualquier contenido ilícito en cuanto tenga conocimiento de él.</p>
      </Section>

      <Section titulo="6. Enlaces a sitios de terceros">
        <p>Este sitio puede incluir enlaces a sitios de terceros (redes sociales, mapas, reseñas, pasarelas de pago). El titular no controla esos sitios ni es responsable de sus contenidos, servicios o políticas de privacidad, que se rigen por sus propias condiciones. La inclusión de un enlace no implica relación ni recomendación.</p>
      </Section>

      <Section titulo="7. Protección de datos">
        <p>El tratamiento de datos personales se rige por la <Link href="/privacidad" className="underline">política de privacidad</Link>.</p>
      </Section>

      <Section titulo="8. Legislación aplicable y jurisdicción">
        <p>Estas condiciones se rigen por la legislación española. Para cualquier controversia con consumidores serán competentes los juzgados y tribunales del domicilio del consumidor.</p>
      </Section>

      <TextoAdicional texto={ctx.legal.adicionalAvisoLegal} />
    </>
  );
}

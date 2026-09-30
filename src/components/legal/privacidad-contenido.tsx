import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { FABRICANTE } from '@/lib/fabricante';
import { subencargadosDe } from '@/lib/legal/subencargados';
import { categoriasDatosDe } from '@/lib/legal/categorias-datos';
import { InfoTable, Section, TablaSimple } from './legal-layout';

const DERECHOS = [
  ['Acceso (Art. 15)', 'Saber qué datos suyos tratamos.'],
  ['Rectificación (Art. 16)', 'Corregir datos inexactos o incompletos.'],
  ['Supresión (Art. 17)', 'Solicitar el borrado de sus datos ("derecho al olvido").'],
  ['Limitación (Art. 18)', 'Suspender el tratamiento en casos concretos.'],
  ['Portabilidad (Art. 20)', 'Recibir sus datos en formato estructurado.'],
  ['Oposición (Art. 21)', 'Oponerse al tratamiento basado en interés legítimo.'],
] as const;

function FinalidadItem({ numero, titulo, base, descripcion }: Readonly<{ numero: string; titulo: string; base: string; descripcion: string }>) {
  return (
    <div className="rounded-[3px] border border-foreground/10 p-3 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{numero}</p>
      <p className="font-semibold text-foreground">{titulo}</p>
      <p className="text-xs text-muted-foreground font-medium">{base}</p>
      <p className="text-xs text-muted-foreground">{descripcion}</p>
    </div>
  );
}

export function PrivacidadContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { titular, flags } = ctx;
  const subencargados = subencargadosDe(flags);
  const categorias = categoriasDatosDe(flags);

  return (
    <>
      <Section titulo="1. Responsable del tratamiento">
        <p>
          De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), le informamos
          de que el <strong>Responsable del Tratamiento</strong> de sus datos personales es:
        </p>
        <InfoTable rows={[
          ['Denominación', titular.nombre],
          titular.nif ? ['NIF/CIF', titular.nif] : null,
          titular.direccion ? ['Dirección', titular.direccion] : null,
          titular.email ? ['Email de contacto', titular.email] : null,
        ]} />
      </Section>

      <Section titulo="2. Encargado del tratamiento">
        <p>
          El software de gestión de este establecimiento lo desarrolla y mantiene{' '}
          <strong>{FABRICANTE.nombre} ({FABRICANTE.nombreComercial})</strong>, que actúa como Encargado del
          Tratamiento en los términos del Art. 28 RGPD:
        </p>
        <InfoTable rows={[
          ['Nombre', `${FABRICANTE.nombre} (${FABRICANTE.nombreComercial})`],
          ['NIF', FABRICANTE.nif],
          ['Dirección', FABRICANTE.direccion],
          ['Email', FABRICANTE.email],
          ['Web', FABRICANTE.web],
        ]} />
      </Section>

      <Section titulo="3. Finalidades y base jurídica">
        <div className="flex flex-col gap-3">
          <FinalidadItem numero="3.1" titulo="Gestión del pedido" base="Ejecución del contrato (Art. 6.1.b RGPD)"
            descripcion="Sus datos son necesarios para procesar y entregar su pedido. Sin ellos no es posible prestar el servicio." />
          <FinalidadItem numero="3.2" titulo="Comunicaciones sobre el pedido" base="Ejecución del contrato e interés legítimo (Art. 6.1.b y 6.1.f RGPD)"
            descripcion="Le enviamos la confirmación del pedido y, en su caso, información sobre su estado o envío." />
          {flags.descuentoBienvenidaActivo && (
            <FinalidadItem numero="3.3" titulo="Envío de promociones y descuentos" base="Consentimiento (Art. 6.1.a RGPD)"
              descripcion="Solo si lo ha aceptado expresamente. Puede retirar su consentimiento en cualquier momento con el enlace de baja de cada comunicación." />
          )}
          <FinalidadItem numero={flags.descuentoBienvenidaActivo ? '3.4' : '3.3'} titulo="Obligaciones fiscales y contables" base="Obligación legal (Art. 6.1.c RGPD)"
            descripcion="Los registros de ventas se conservan durante 5 años conforme al Art. 66 de la Ley 58/2003 General Tributaria." />
        </div>
      </Section>

      <Section titulo="4. Categorías de datos tratados">
        <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2">
          {categorias.map((c) => (
            <li key={c.titulo}><strong>{c.titulo}:</strong> {c.descripcion}</li>
          ))}
        </ul>
        <p className="text-muted-foreground">No se tratan categorías especiales de datos (salud, ideología, origen racial, etc.).</p>
      </Section>

      <Section titulo="5. Plazos de conservación">
        <p>
          Sus datos se conservan mientras exista una relación activa con el establecimiento. Tras{' '}
          <strong>5 años sin actividad</strong>, sus datos identificativos se anonimizan de forma automática,
          conservando solo los registros de pedidos y cobros exigidos por la normativa fiscal.
        </p>
      </Section>

      <Section titulo="6. Destinatarios y subencargados">
        <p>Pueden acceder a sus datos los siguientes prestadores de servicios técnicos, todos con garantías adecuadas:</p>
        <TablaSimple cabeceras={['Proveedor', 'Finalidad', 'País']} filas={subencargados.map((s) => [s.proveedor, s.finalidad, s.pais])} />
        <p className="text-xs text-muted-foreground">
          SCCs = Cláusulas Contractuales Tipo aprobadas por la Comisión Europea (Art. 46 RGPD).
        </p>
      </Section>

      <Section titulo="7. Sus derechos">
        <p>
          Puede ejercerlos dirigiéndose al Responsable en la dirección de la sección 1
          {titular.email ? ` o por email a ${titular.email}` : ''}:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DERECHOS.map(([derecho, desc]) => (
            <div key={derecho} className="rounded-[3px] border border-foreground/10 p-3 text-xs">
              <p className="font-semibold text-foreground">{derecho}</p>
              <p className="text-muted-foreground mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground">
          Si considera que sus derechos no se han atendido correctamente, puede reclamar ante la{' '}
          <strong>Agencia Española de Protección de Datos (AEPD)</strong>: <span className="font-mono">www.aepd.es</span>
        </p>
      </Section>

      <Section titulo="8. Menores de edad">
        <p>Este servicio no está dirigido a menores de 14 años. Si sabe que un menor nos ha facilitado datos sin consentimiento de sus tutores, comuníquenoslo para suprimirlos.</p>
      </Section>

      <Section titulo="9. Cookies">
        <p>
          Este sitio usa únicamente <strong>cookies técnicas estrictamente necesarias</strong> (sesión y seguridad CSRF).
          No se usan cookies de seguimiento, analítica de terceros ni publicidad, por lo que no se requiere banner de
          consentimiento (Ley 34/2002, LSSI-CE).
        </p>
      </Section>

      <p className="text-xs text-muted-foreground border-t border-foreground/10 pt-4">
        Normativa de referencia: RGPD (UE) 2016/679 · LO 3/2018 (LOPDGDD) · Ley 58/2003 General Tributaria (Art. 66) · Ley 34/2002 (LSSI-CE)
      </p>
    </>
  );
}

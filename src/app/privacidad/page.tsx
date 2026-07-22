import { getEmpresaPublicRepository } from '@/core/infrastructure/database';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { FABRICANTE } from '@/lib/fabricante';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PrivacidadPage() {
  const domain = await getDomainFromHeaders();
  const result = domain ? await getEmpresaPublicRepository().findByDomainPublic(domain) : null;
  const empresa = result?.success ? result.data : null;

  const responsableNombre = empresa?.razonSocial ?? empresa?.nombre ?? 'el titular de este sitio';
  const responsableNif = empresa?.nif ? `NIF/CIF: ${empresa.nif}` : null;
  const responsableDireccion = empresa?.direccion ?? null;
  const responsableEmail = empresa?.emailNotification ?? null;
  const actualizacion = '2026-07-22';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
              Aviso Legal
            </p>
            <h1 className="text-2xl font-bold">Política de Privacidad</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Última actualización: {actualizacion}
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground underline"
          >
            ← Volver
          </Link>
        </div>

        {/* Responsable del tratamiento */}
        <Section titulo="1. Responsable del Tratamiento">
          <p>
            De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018
            (LOPDGDD), le informamos de que el <strong>Responsable del Tratamiento</strong> de
            sus datos personales es:
          </p>
          <InfoTable rows={[
            ['Denominación', responsableNombre],
            responsableNif ? ['Identificación fiscal', responsableNif] : null,
            responsableDireccion ? ['Dirección', responsableDireccion] : null,
            responsableEmail ? ['Email de contacto', responsableEmail] : null,
          ]} />
          <p className="text-sm text-muted-foreground">
            El Responsable es quien decide sobre los fines y medios del tratamiento
            de los datos de sus clientes.
          </p>
        </Section>

        {/* Encargado del tratamiento */}
        <Section titulo="2. Encargado del Tratamiento">
          <p>
            El software de gestión utilizado en este establecimiento es desarrollado
            y mantenido por <strong>{FABRICANTE.nombre} ({FABRICANTE.nombreComercial})</strong>,
            que actúa como Encargado del Tratamiento en los términos del Art. 28 RGPD:
          </p>
          <InfoTable rows={[
            ['Nombre', `${FABRICANTE.nombre} (${FABRICANTE.nombreComercial})`],
            ['NIF', FABRICANTE.nif],
            ['Dirección', FABRICANTE.direccion],
            ['Email', FABRICANTE.email],
            ['Web', FABRICANTE.web],
          ]} />
          <p className="text-sm text-muted-foreground">
            El Encargado trata los datos únicamente siguiendo las instrucciones del
            Responsable y no los utiliza para fines propios.
          </p>
        </Section>

        {/* Finalidades y base jurídica */}
        <Section titulo="3. Finalidades y Base Jurídica del Tratamiento">
          <div className="flex flex-col gap-4">
            <FinalidadItem
              numero="3.1"
              titulo="Gestión del pedido"
              base="Ejecución del contrato (Art. 6.1.b RGPD)"
              descripcion="Sus datos (nombre y teléfono) son necesarios para procesar y entregar su pedido. Sin ellos no es posible prestar el servicio."
            />
            <FinalidadItem
              numero="3.2"
              titulo="Comunicaciones de entrega y estado del pedido"
              base="Interés legítimo (Art. 6.1.f RGPD)"
              descripcion="Podemos contactarle por teléfono o mensaje para informarle sobre el estado o incidencias de su pedido."
            />
            <FinalidadItem
              numero="3.3"
              titulo="Envío de promociones y descuentos"
              base="Consentimiento (Art. 6.1.a RGPD)"
              descripcion="Solo si usted ha optado explícitamente por recibirlas. Puede retirar su consentimiento en cualquier momento usando el enlace de baja incluido en cada comunicación."
            />
            <FinalidadItem
              numero="3.4"
              titulo="Obligaciones fiscales y contables"
              base="Obligación legal (Art. 6.1.c RGPD)"
              descripcion="Los registros de ventas se conservan durante 5 años conforme al Art. 66 de la Ley 58/2003 General Tributaria."
            />
          </div>
        </Section>

        {/* Datos tratados */}
        <Section titulo="4. Categorías de Datos Tratados">
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground pl-2">
            <li><strong>Datos identificativos:</strong> nombre y apellidos.</li>
            <li><strong>Datos de contacto:</strong> teléfono y correo electrónico (opcional).</li>
            <li><strong>Datos de dirección:</strong> dirección de entrega, solo para pedidos a domicilio.</li>
            <li><strong>Datos económicos:</strong> importe del pedido. No se almacenan datos de tarjeta de crédito.</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            No se tratan categorías especiales de datos (salud, ideología, origen racial, etc.).
          </p>
        </Section>

        {/* Conservación */}
        <Section titulo="5. Plazos de Conservación">
          <p className="text-sm">
            Sus datos personales se conservan mientras exista una relación activa con el establecimiento.
            Transcurridos <strong>5 años sin actividad</strong>, sus datos identificativos (nombre, email,
            teléfono) serán anonimizados de forma automática, conservando únicamente los registros de
            pedidos y cobros exigidos por la normativa fiscal.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Puede solicitar la supresión anticipada de sus datos en cualquier momento ejerciendo su derecho
            al olvido (véase sección 7).
          </p>
        </Section>

        {/* Subencargados */}
        <Section titulo="6. Destinatarios y Subencargados">
          <p className="text-sm mb-3">
            Sus datos pueden ser accedidos por los siguientes prestadores de servicios técnicos,
            todos ellos con garantías adecuadas de protección:
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-semibold">Proveedor</th>
                  <th className="text-left p-2 font-semibold">Finalidad</th>
                  <th className="text-left p-2 font-semibold">País</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ['Supabase (Irlanda)', 'Base de datos y almacenamiento', 'UE'],
                  ['Vercel Inc.', 'Infraestructura de hosting', 'UE/EE.UU. (SCCs)'],
                  ['Brevo (Francia)', 'Envío de emails de marketing', 'UE'],
                  ['Redsys (España)', 'Procesamiento de pagos con tarjeta', 'UE'],
                  ['Glovo App S.L. (España)', 'Cálculo de rutas de entrega', 'UE'],
                  ['Sentry (EE.UU.)', 'Monitorización de errores técnicos', 'EE.UU. (SCCs)'],
                ].map(([prov, fin, pais]) => (
                  <tr key={prov} className="hover:bg-muted/20">
                    <td className="p-2 font-medium">{prov}</td>
                    <td className="p-2 text-muted-foreground">{fin}</td>
                    <td className="p-2">{pais}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            SCCs = Cláusulas Contractuales Tipo aprobadas por la Comisión Europea (Art. 46 RGPD).
            No se realizan transferencias a terceros países sin garantías adecuadas.
          </p>
        </Section>

        {/* Derechos */}
        <Section titulo="7. Sus Derechos">
          <p className="text-sm mb-3">
            Puede ejercer los siguientes derechos dirigiéndose al Responsable del Tratamiento
            en la dirección indicada en la sección 1{responsableEmail ? ` o por email a ${responsableEmail}` : ''}:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              ['Acceso (Art. 15)', 'Saber qué datos suyos tratamos.'],
              ['Rectificación (Art. 16)', 'Corregir datos inexactos o incompletos.'],
              ['Supresión (Art. 17)', 'Solicitar el borrado de sus datos ("derecho al olvido").'],
              ['Limitación (Art. 18)', 'Suspender el tratamiento en casos concretos.'],
              ['Portabilidad (Art. 20)', 'Recibir sus datos en formato estructurado.'],
              ['Oposición (Art. 21)', 'Oponerse al tratamiento basado en interés legítimo.'],
            ].map(([derecho, desc]) => (
              <div key={derecho} className="rounded-lg border border-border p-3 text-xs">
                <p className="font-semibold text-foreground">{derecho}</p>
                <p className="text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Si considera que sus derechos no han sido atendidos correctamente, puede presentar
            una reclamación ante la{' '}
            <strong>Agencia Española de Protección de Datos (AEPD)</strong>:{' '}
            <span className="font-mono">www.aepd.es</span>
          </p>
        </Section>

        {/* Menores */}
        <Section titulo="8. Menores de Edad">
          <p className="text-sm">
            Este servicio no está dirigido a menores de 14 años. Si tiene conocimiento de que un
            menor ha facilitado datos personales sin el consentimiento de sus tutores, le rogamos
            que nos lo comunique para proceder a su supresión.
          </p>
        </Section>

        {/* Cookies */}
        <Section titulo="9. Cookies">
          <p className="text-sm">
            Este sitio web utiliza únicamente <strong>cookies técnicas estrictamente necesarias</strong>{' '}
            para el funcionamiento del servicio (gestión de sesión, seguridad CSRF).
            No se utilizan cookies de seguimiento, analítica de terceros ni publicidad.
            Por este motivo, no se requiere banner de consentimiento de cookies conforme a la Ley 34/2002 (LSSI-CE).
          </p>
        </Section>

        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Normativa de referencia: RGPD (UE) 2016/679 · Ley Orgánica 3/2018 (LOPDGDD) ·
          Ley 58/2003 General Tributaria (Art. 66) · Ley 34/2002 (LSSI-CE)
        </p>
      </div>
    </div>
  );
}

function Section({ titulo, children }: Readonly<{ titulo: string; children: React.ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-foreground border-b border-border pb-2">{titulo}</h2>
      <div className="flex flex-col gap-2 text-sm text-foreground leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function InfoTable({ rows }: Readonly<{ rows: ([string, string] | null)[] }>) {
  const validRows = rows.filter((r): r is [string, string] => r !== null);
  if (validRows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-1.5 text-sm">
      {validRows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <span className="text-muted-foreground shrink-0 w-36">{label}:</span>
          <span className="font-medium">{value}</span>
        </div>
      ))}
    </div>
  );
}

function FinalidadItem({ numero, titulo, base, descripcion }: Readonly<{
  numero: string;
  titulo: string;
  base: string;
  descripcion: string;
}>) {
  return (
    <div className="rounded-lg border border-border p-3 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{numero}</p>
      <p className="font-semibold text-foreground">{titulo}</p>
      <p className="text-xs text-primary font-medium">{base}</p>
      <p className="text-xs text-muted-foreground">{descripcion}</p>
    </div>
  );
}

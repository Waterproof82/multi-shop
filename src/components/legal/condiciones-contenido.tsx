import Link from 'next/link';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { Section, TextoAdicional } from './legal-layout';

function nombreImpuesto(tipo: LegalContext['tipoImpuesto']): string {
  return tipo === 'igic' ? 'IGIC (Impuesto General Indirecto Canario)' : 'IVA';
}

function metodosDePago(ctx: LegalContext): string {
  if (ctx.flags.pagoTarjetaActivo) {
    return 'Tarjeta de débito o crédito a través de la pasarela segura de Redsys, o los medios que se indiquen en el proceso de compra. No almacenamos los datos de su tarjeta.';
  }
  return 'Los medios que se indiquen en el proceso de compra.';
}

function Desistimiento({ ctx }: Readonly<{ ctx: LegalContext }>) {
  if (ctx.tipo === 'tienda') {
    return (
      <p>
        Dispone de un plazo de {ctx.legal.plazoDesistimientoDias} días naturales para desistir de su compra. Consulte las condiciones,
        exclusiones y la garantía en{' '}
        <Link href="/devoluciones" className="underline">Devoluciones y garantía</Link>.
      </p>
    );
  }
  return (
    <p>
      Al tratarse de productos que pueden deteriorarse o caducar con rapidez, no es aplicable el derecho de desistimiento
      (art. 103.d del Real Decreto Legislativo 1/2007). Si su pedido llega incompleto o en mal estado, contacte con nosotros y lo resolveremos.
    </p>
  );
}

export function CondicionesContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { titular } = ctx;
  return (
    <>
      <Section titulo="1. Objeto y vendedor">
        <p>
          Estas condiciones regulan la compra de productos a través de este sitio web, cuyo titular es {titular.nombre}
          {titular.nif ? ` (NIF/CIF ${titular.nif})` : ''}. Al realizar un pedido, el cliente declara haberlas leído y aceptado.
        </p>
      </Section>

      <Section titulo="2. Proceso de compra">
        <p>Seleccione los productos, revise el carrito, indique sus datos y la forma de entrega y confirme el pedido. Recibirá un email de confirmación con el detalle de su compra.</p>
      </Section>

      <Section titulo="3. Precios e impuestos">
        <p>Los precios se muestran en {ctx.moneda} e incluyen el {nombreImpuesto(ctx.tipoImpuesto)}. Los gastos de entrega, si los hay, se indican antes de confirmar el pedido.</p>
      </Section>

      <Section titulo="4. Formas de pago">
        <p>{metodosDePago(ctx)}</p>
      </Section>

      {ctx.flags.deliveryHabilitado && (
        <Section titulo="5. Reparto a domicilio">
          <p>
            Los pedidos a domicilio los entrega un servicio de mensajería externo contratado por {titular.nombre}. El coste del
            reparto se muestra en el carrito antes de confirmar. Cualquier incidencia con la entrega debe comunicarse a{' '}
            {titular.nombre}, que es el responsable del pedido frente al cliente.
          </p>
        </Section>
      )}

      <Section titulo="Derecho de desistimiento">
        <Desistimiento ctx={ctx} />
      </Section>

      <Section titulo="Atención al cliente y reclamaciones">
        <p>
          Puede contactar con nosotros{titular.email ? ` en ${titular.email}` : ''}{titular.telefono ? ` o en el ${titular.telefono}` : ''}.
          Tiene a su disposición hojas de reclamación oficiales.
        </p>
      </Section>

      <Section titulo="Legislación aplicable">
        <p>Estas condiciones se rigen por la legislación española. Para controversias con consumidores son competentes los juzgados del domicilio del consumidor.</p>
      </Section>

      <TextoAdicional texto={ctx.legal.adicionalCondiciones} />
    </>
  );
}

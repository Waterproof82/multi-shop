import type { LegalContext, ModalidadDomicilioLegal } from '@/core/domain/entities/empresa-legal';
import { formatPrice } from '@/lib/format-price';
import { formatRangoHorasModalidad } from '@/lib/modalidad-entrega-iconos';
import { Section, TablaSimple, TextoAdicional } from './legal-layout';

function plazo(m: ModalidadDomicilioLegal): string {
  if (m.tiempoMin === null || m.tiempoMax === null) return '—';
  return formatRangoHorasModalidad(m.tiempoMin, m.tiempoMax, 'es');
}

function precio(cents: number, moneda: string): string {
  if (cents === 0) return 'Gratis';
  return formatPrice(cents / 100, moneda, 'es');
}

export function EnviosContenido({ ctx }: Readonly<{ ctx: LegalContext }>) {
  const { legal, modalidadesDomicilio: modalidades } = ctx;
  return (
    <>
      <Section titulo="1. Zonas, plazos y costes de envío">
        {modalidades.length === 0 ? (
          <p>Las opciones de envío disponibles, con su precio y plazo, se muestran en el carrito antes de confirmar el pedido.</p>
        ) : (
          <TablaSimple
            cabeceras={['Modalidad', 'Precio', 'Plazo de entrega']}
            filas={modalidades.map((m) => [m.nombre, precio(m.precioCents, ctx.moneda), plazo(m)])}
          />
        )}
        {legal.plazoPreparacionDias !== null && (
          <p>Los pedidos se preparan y entregan al transportista en un máximo de {legal.plazoPreparacionDias} días hábiles desde la confirmación del pago.</p>
        )}
        <p>Recibirá un email con el número de seguimiento cuando su pedido salga de nuestras instalaciones.</p>
      </Section>

      <Section titulo="2. Incidencias en la entrega">
        {legal.plazoAvisoDanosHoras === null ? (
          <p>Si el paquete llega dañado, anótelo al transportista y comuníquenoslo cuanto antes, preferiblemente con fotografías.</p>
        ) : (
          <p>Si el paquete llega dañado, comuníquenoslo en las {legal.plazoAvisoDanosHoras} horas siguientes a la entrega, preferiblemente con fotografías, para gestionar la reclamación con el transportista. Este aviso no limita sus derechos de garantía.</p>
        )}
      </Section>

      <Section titulo="3. Formas de pago">
        <p>
          {ctx.flags.pagoTarjetaActivo
            ? 'Tarjeta de débito o crédito mediante la pasarela segura de Redsys. No almacenamos los datos de su tarjeta.'
            : 'Los medios de pago disponibles se indican en el proceso de compra.'}
        </p>
      </Section>

      <TextoAdicional texto={legal.adicionalEnvios} />
    </>
  );
}

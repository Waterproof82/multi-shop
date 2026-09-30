import type { FlagsLegales } from '@/core/domain/entities/empresa-legal';

export interface Subencargado {
  readonly proveedor: string;
  readonly finalidad: string;
  readonly pais: string;
}

/** "a" · "a y b" · "a, b y c" */
function listaEnCastellano(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

/**
 * Brevo lo usa la plataforma para TODOS los tenants (confirmación de pedido),
 * y además para el email de seguimiento de envío (tienda) y el del descuento
 * de bienvenida. Ver enviar-confirmacion-pedido.use-case.ts,
 * api/admin/pedidos/[pedidoId]/seguimiento/route.ts y descuento.use-case.ts.
 */
function finalidadBrevo(f: FlagsLegales): string {
  const partes = ['confirmación de pedidos'];
  if (f.envioDomicilioHabilitado) partes.push('seguimiento de envíos');
  if (f.descuentoBienvenidaActivo) partes.push('promociones');
  return `Envío de emails de ${listaEnCastellano(partes)}`;
}

export function subencargadosDe(f: FlagsLegales): Subencargado[] {
  const lista: Subencargado[] = [
    { proveedor: 'Supabase (Irlanda)', finalidad: 'Base de datos y almacenamiento', pais: 'UE' },
    { proveedor: 'Vercel Inc.', finalidad: 'Infraestructura de hosting', pais: 'UE/EE.UU. (SCCs)' },
    { proveedor: 'Brevo (Francia)', finalidad: finalidadBrevo(f), pais: 'UE' },
  ];
  if (f.pagoTarjetaActivo) {
    lista.push({ proveedor: 'Redsys (España)', finalidad: 'Procesamiento de pagos con tarjeta', pais: 'UE' });
  }
  if (f.deliveryHabilitado) {
    lista.push({ proveedor: 'Glovo App S.L. (España)', finalidad: 'Reparto a domicilio de pedidos', pais: 'UE' });
  }
  lista.push({ proveedor: 'Sentry (EE.UU.)', finalidad: 'Monitorización de errores técnicos', pais: 'EE.UU. (SCCs)' });
  return lista;
}
